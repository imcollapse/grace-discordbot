// grace · ,notify  — new-post alerts for this server
//   notify <platform> add <account> [#channel] [@role]
//   notify <platform> remove <account>
//   notify <platform> list          notify list   (everything)
//   platforms: youtube (yt) · reddit · instagram (ig) · tiktok (tt) · twitter (x) · twitch (own command)

const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const ui = require('../../services/ui');
const { icon, pre } = require('../../services/icons');
const feeds = require('../../services/socialFeeds');
const SocialFeed = require('../../database/schemas/SocialFeed');
const TwitchNotify = require('../../database/schemas/TwitchNotify');
const config = require('../../settings');

const NO = { parse: [] };
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const note = (kind, text, footer) => ui.notice(kind, text, footer ? { footer } : {});

const usage = (p) => {
  const c = ui.box('base').addTextDisplayComponents(ui.text('### New-post alerts'));
  c.addTextDisplayComponents(ui.text([
    `\`${p}notify youtube add <@handle or link> [#channel] [@role]\``,
    `\`${p}notify reddit add <subreddit> [#channel] [@role]\``,
    `\`${p}notify instagram add <username> [#channel] [@role]\``,
    `\`${p}notify tiktok add <username> [#channel] [@role]\``,
    `\`${p}notify twitter add <username> [#channel] [@role]\``,
    `\`${p}notify twitch add <name> [#channel] [@role]\``,
    '',
    `\`${p}notify <platform> remove <account>\` · \`${p}notify <platform> list\` · \`${p}notify list\``,
  ].join('\n')));
  c.addTextDisplayComponents(ui.text(ui.sub('Needs Manage Server. YouTube checks every 5 minutes, Reddit every 10, Instagram, TikTok and X every 15.')));
  return c;
};

async function list(message, platform) {
  const where = { guildId: message.guild.id, ...(platform ? { platform } : {}) };
  const rows = await SocialFeed.findAll({ where, order: [['platform', 'ASC'], ['name', 'ASC']] });
  const tw = !platform || platform === 'twitch' ? await TwitchNotify.findAll({ where: { guildId: message.guild.id } }) : [];
  if (!rows.length && !tw.length) return ui.send(message, note('info', 'No alerts yet.', `${config.PREFIX}notify youtube add @handle`), { extra: { allowedMentions: NO } });
  const lines = [
    ...rows.map(r => `${pre(r.platform)}**${feeds.PLATFORMS[r.platform].label}** · [${clip(r.name, 40)}](${r.url ?? '#'}) → <#${r.channelId}>${r.roleId ? ` · <@&${r.roleId}>` : ''}`),
    ...tw.map(r => `${pre('twitch')}**Twitch** · [${clip(r.name, 40)}](https://www.twitch.tv/${r.login}) → <#${r.channelId}>${r.roleId ? ` · <@&${r.roleId}>` : ''}`),
  ];
  const c = ui.box('base').addTextDisplayComponents(ui.text(`### Alerts (${lines.length})`));
  c.addTextDisplayComponents(ui.text(lines.join('\n').slice(0, 3800)));
  return ui.send(message, c, { extra: { allowedMentions: NO } });
}

module.exports = {
  name: 'notify',
  aliases: ['feeds', 'alerts'],
  description: 'New-post alerts for YouTube, Reddit, Instagram, TikTok, X and Twitch',
  usage: 'notify <platform> <add|remove|list> …',
  category: 'social',

  async execute(message, args = []) {
    const send = (c) => ui.send(message, c, { extra: { allowedMentions: NO } });
    if (!message.guild) return;
    const p = message.usedPrefix || config.PREFIX;
    const first = (args[0] || '').toLowerCase();

    if (!first) return send(usage(p));
    if (first === 'list') return list(message, null);
    if (first === 'twitch') return require('../dual/twitch/twitch').execute(message, ['notify', ...args.slice(1)]);

    const platform = feeds.ALIASES[first];
    if (!platform) return send(usage(p));
    const P = feeds.PLATFORMS[platform];
    const act = (args[1] || 'list').toLowerCase();
    if (act === 'list') return list(message, platform);

    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) return send(note('error', 'You need **Manage Server** to change alerts.'));

    try {
      if (['remove', 'delete', 'del', 'rm'].includes(act)) {
        const arg = args.slice(2).join(' ').trim();
        if (!arg) return send(note('warning', 'Which one?', `${p}notify ${first} remove <account>`));
        const rows = await SocialFeed.findAll({ where: { guildId: message.guild.id, platform } });
        const q = arg.toLowerCase().replace(/^@/, '').replace(/^r\//, '');
        const hit = rows.find(r => r.accountKey.toLowerCase() === q || r.name.toLowerCase().replace(/^r\//, '') === q || (r.url && arg.includes(r.accountKey)));
        if (!hit) return send(note('warning', `**${clip(arg, 40)}** is not in this server's ${P.label} alerts.`, `${p}notify ${first} list`));
        await hit.destroy();
        return send(note('success', `Removed **${hit.name}** from ${P.label} alerts.`));
      }

      if (act !== 'add') return send(usage(p));
      const rest = args.slice(2);
      const chId = rest.map(a => a.match(/^<#(\d+)>$/)?.[1]).find(Boolean);
      const roleId = rest.map(a => a.match(/^<@&(\d+)>$/)?.[1]).find(Boolean);
      const account = rest.filter(a => !/^<[#@]/.test(a)).join(' ').trim();
      if (!account) return send(note('warning', `Which ${P.label} account?`, `${p}notify ${first} add <account> [#channel] [@role]`));

      const count = await SocialFeed.count({ where: { guildId: message.guild.id, platform } });
      if (count >= P.limit) return send(note('warning', `This server already has ${P.limit} ${P.label} alerts. Remove one first.`));

      const target = (chId && message.guild.channels.cache.get(chId)) || message.channel;
      const perms = target.permissionsFor?.(message.guild.members.me);
      if (perms && !(perms.has(PermissionFlagsBits.ViewChannel) && perms.has(PermissionFlagsBits.SendMessages))) return send(note('error', `I can't send messages in <#${target.id}>.`));

      message.channel.sendTyping?.().catch(() => {});
      const who = await P.resolve(account);
      const items = await P.fetch(who.key).catch(() => []);       // what is there now, so only later posts are announced
      const base = feeds.baseline(items ?? []);
      const [row, created] = await SocialFeed.findOrCreate({
        where: { guildId: message.guild.id, platform, accountKey: who.key },
        defaults: { guildId: message.guild.id, platform, accountKey: who.key, name: who.name, url: who.url, avatar: who.avatar, channelId: target.id, roleId: roleId ?? null, addedBy: message.author.id, ...base },
      });
      if (!created) await row.update({ channelId: target.id, roleId: roleId ?? row.roleId, name: who.name });
      return send(note('success', `${created ? 'Added' : 'Updated'} **${who.name}**. New ${P.label} posts go to <#${target.id}>${roleId ? ` and ping <@&${roleId}>` : ''}.`, 'Only posts made from now on are announced'));
    } catch (e) {
      if (!(e instanceof feeds.FeedError) && !e.code) console.error('[notify]', e);
      return send(note('error', e instanceof feeds.FeedError || e.code ? e.message : 'Something went wrong while setting that up.'));
    }
  },
};
