// grace · ,twitch  ·  /twitch   (official Twitch Helix API)
//   user <name>          profile card
//   live <name>          is the streamer live? title, game, viewers
//   top [game]           most watched streams, optionally in one category
//   game <name>          category info and its top streams
//   games                most popular categories right now
//   search <query>       find channels
//   clips <name> [day|week|month|year|all]
//   videos <name>        latest broadcasts
//   schedule <name>      upcoming streams
//   emotes <name>        channel emotes
//   notify add|remove|list   live alerts for this server (needs Manage Server)

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const ui = require('../../../services/ui');
const { icon, pre } = require('../../../services/icons');
const tw = require('../../../services/twitch');
const { pager } = require('../../../services/pager');
const Notify = require('../../../database/schemas/TwitchNotify');

const NO = { parse: [] };
const PURPLE = 0x9146FF;
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const num = (n) => (n === null || n === undefined ? '0' : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const ts = (d, f = 'R') => `<t:${Math.floor(d.getTime() / 1000)}:${f}>`;

const isSlash = (ctx) => !!ctx.isChatInputCommand?.();
const userOf = (ctx) => ctx.user ?? ctx.author;
const send = (ctx, comps) => ui.send(ctx, comps, { extra: { allowedMentions: NO } });
const note = (kind, text, footer) => ui.notice(kind, text, footer ? { footer } : {});
const base = () => ui.box('base').setAccentColor(PURPLE);
const gallery = (url) => new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url));
const foot = (c, t = '') => c.addTextDisplayComponents(ui.text(ui.sub(`${t ? t + ' • ' : ''}twitch.tv`)));
const cutThumb = (u, w = 320, h = 180) => (u || '').replace('{width}', w).replace('{height}', h);

async function guarded(ctx, fn) {
  try { return await fn(); }
  catch (e) {
    const known = e instanceof tw.TwitchError;
    if (!known) console.error('[twitch]', e);
    const msg = !tw.configured() ? 'Twitch is not set up on this bot yet. The owner needs to add `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.'
      : known ? e.message : 'Something went wrong while talking to Twitch.';
    return send(ctx, note('error', msg)).catch(() => {});
  }
}

/* ── cards ─────────────────────────────────────────────────────────── */

function streamCard(s, { header = null } = {}) {
  const c = base();
  c.addTextDisplayComponents(ui.text(`### ${pre('twitch')}${header ?? `${s.name} is live`}`));
  c.addTextDisplayComponents(ui.text(`**${clip(s.title, 200) || 'Untitled stream'}**\nPlaying **${s.game}**  ·  ${num(s.viewers)} watching  ·  started ${ts(s.started)}`));
  if (s.thumb) c.addMediaGalleryComponents(gallery(`${s.thumb}?t=${Math.floor(Date.now() / 60000)}`));
  const meta = [s.mature ? '18+' : null, s.lang ? s.lang.toUpperCase() : null, ...s.tags.slice(0, 4)].filter(Boolean).join('  ·  ');
  if (meta) c.addTextDisplayComponents(ui.text(ui.sub(meta)));
  return c;
}

async function cmdUser(ctx, name) {
  if (!name) return send(ctx, note('warning', 'Whose channel?', 'twitch user <name>'));
  const u = await tw.user(name);
  const [info, live] = await Promise.all([tw.channelInfo(u.id).catch(() => null), tw.stream(u.id).catch(() => null)]);
  const c = base();
  const lines = [
    `## ${pre('twitch')}${u.name}${live ? `  ${icon('live', '🔴')} LIVE` : ''}`,
    u.about ? clip(u.about, 400) : '',
    `${u.type === 'partner' ? 'Partner' : u.type === 'affiliate' ? 'Affiliate' : 'Streamer'}${u.staff ? `  ·  ${u.staff}` : ''}  ·  joined ${ts(u.created, 'D')}`,
    info?.game ? `Last category: **${info.game}**` : '',
    info?.lang ? `Language: ${info.lang.toUpperCase()}` : '',
  ].filter(Boolean).join('\n');
  c.addSectionComponents(ui.section(lines, u.avatar));
  if (live) c.addTextDisplayComponents(ui.text(`**Live now:** ${clip(live.title, 120)}  ·  ${live.game}  ·  ${num(live.viewers)} watching`));
  if (u.banner) c.addMediaGalleryComponents(gallery(u.banner));
  foot(c);
  c.addActionRowComponents(ui.row(ui.link('Open channel', u.url, icon('twitch') || undefined)));
  return send(ctx, c);
}

async function cmdLive(ctx, name) {
  if (!name) return send(ctx, note('warning', 'Whose stream?', 'twitch live <name>'));
  const u = await tw.user(name);
  const s = await tw.stream(u.id);
  if (!s) {
    const c = base();
    c.addSectionComponents(ui.section(`### ${u.name} is offline\nNo stream right now. Try \`twitch videos ${u.login}\` or \`twitch schedule ${u.login}\`.`, u.avatar));
    foot(c);
    c.addActionRowComponents(ui.row(ui.link('Open channel', u.url, icon('twitch') || undefined)));
    return send(ctx, c);
  }
  const c = streamCard(s);
  foot(c);
  c.addActionRowComponents(ui.row(ui.link('Watch', s.url, icon('twitch') || undefined)));
  return send(ctx, c);
}

async function listStreams(ctx, streams, title, { empty = 'Nobody is live there right now.' } = {}) {
  if (!streams.length) return send(ctx, note('warning', empty));
  const size = 5, total = Math.ceil(streams.length / size);
  return pager(ctx, {
    total, user: userOf(ctx), send: (c) => send(ctx, c),
    render: (at) => {
      const c = base().addTextDisplayComponents(ui.text(`### ${title}`));
      streams.slice(at * size, at * size + size).forEach((s, i) => {
        c.addTextDisplayComponents(ui.text(`**${at * size + i + 1}. [${s.name}](${s.url})**  ·  ${num(s.viewers)} watching\n${clip(s.title, 90)}\n${ui.sub(s.game)}`));
      });
      foot(c, `Page ${at + 1}/${total}`);
      return c;
    },
  });
}

async function cmdTop(ctx, name) {
  let gameId, title = 'Top streams right now';
  if (name) {
    const g = await tw.game(name);
    if (!g) return send(ctx, note('warning', `No category called **${clip(name, 50)}**.`));
    gameId = g.id; title = `Top streams in ${g.name}`;
  }
  const r = await tw.topStreams({ gameId, first: 25 });
  return listStreams(ctx, r.streams, title);
}

async function cmdGame(ctx, name) {
  if (!name) return send(ctx, note('warning', 'Which category?', 'twitch game <name>'));
  const g = await tw.game(name);
  if (!g) return send(ctx, note('warning', `No category called **${clip(name, 50)}**.`));
  const r = await tw.topStreams({ gameId: g.id, first: 5 });
  const c = base();
  c.addSectionComponents(ui.section(`## ${g.name}\n${r.streams.length ? `${num(r.streams.reduce((a, s) => a + s.viewers, 0))} watching across the top streams` : 'Nobody is live here right now.'}`, g.art));
  r.streams.forEach((s, i) => c.addTextDisplayComponents(ui.text(`**${i + 1}. [${s.name}](${s.url})**  ·  ${num(s.viewers)}\n${ui.sub(clip(s.title, 90))}`)));
  foot(c);
  c.addActionRowComponents(ui.row(ui.link('Open category', g.url)));
  return send(ctx, c);
}

async function cmdGames(ctx) {
  const list = await tw.topGames(20);
  const c = base().addTextDisplayComponents(ui.text('### Most popular categories'));
  c.addTextDisplayComponents(ui.text(list.map((g, i) => `**${i + 1}.** [${g.name}](${g.url})`).join('\n')));
  foot(c);
  return send(ctx, c);
}

async function cmdSearch(ctx, q) {
  if (!q) return send(ctx, note('warning', 'What should I look for?', 'twitch search <query>'));
  const r = await tw.searchChannels(q);
  if (!r.length) return send(ctx, note('warning', `No channels found for **${clip(q, 50)}**.`));
  const c = base().addTextDisplayComponents(ui.text(`### Channels for “${clip(q, 40)}”`));
  r.slice(0, 8).forEach(x => c.addTextDisplayComponents(ui.text(`${x.live ? icon('live', '🔴') : icon('offline', '⚫')} **[${x.name}](${x.url})**${x.game ? `  ·  ${x.game}` : ''}${x.title ? `\n${ui.sub(clip(x.title, 90))}` : ''}`)));
  foot(c);
  return send(ctx, c);
}

async function cmdClips(ctx, rest) {
  const parts = rest.trim().split(/\s+/).filter(Boolean);
  const last = (parts[parts.length - 1] || '').toLowerCase();
  const period = tw.PERIODS[last] !== undefined ? parts.pop().toLowerCase() : 'week';
  if (!parts.length) return send(ctx, note('warning', 'Whose clips?', 'twitch clips <name> [day|week|month|year|all]'));
  const u = await tw.user(parts.join(' '));
  const list = (await tw.clips(u.id, period)).sort((a, b) => b.views - a.views);
  if (!list.length) return send(ctx, note('warning', `No clips from **${u.name}** in that time.`, `Try: twitch clips ${u.login} all`));
  return pager(ctx, {
    total: list.length, user: userOf(ctx), send: (c) => send(ctx, c),
    extra: (at) => [ui.link('Watch clip', list[at].url)],
    render: (at) => {
      const k = list[at];
      const c = base().addTextDisplayComponents(ui.text(`### ${clip(k.title, 120)}`));
      if (k.thumb) c.addMediaGalleryComponents(gallery(k.thumb));
      c.addTextDisplayComponents(ui.text(`${u.name}  ·  clipped by **${clip(k.creator, 30)}**  ·  ${num(k.views)} views  ·  ${k.duration}s  ·  ${ts(k.created)}`));
      foot(c, `Clip ${at + 1}/${list.length} · ${period === 'all' ? 'all time' : `past ${period}`}`);
      return c;
    },
  });
}

async function cmdVideos(ctx, name) {
  if (!name) return send(ctx, note('warning', 'Whose videos?', 'twitch videos <name>'));
  const u = await tw.user(name);
  const list = await tw.videos(u.id);
  if (!list.length) return send(ctx, note('warning', `**${u.name}** has no saved broadcasts.`));
  return pager(ctx, {
    total: list.length, user: userOf(ctx), send: (c) => send(ctx, c),
    extra: (at) => [ui.link('Watch', list[at].url)],
    render: (at) => {
      const v = list[at];
      const c = base().addTextDisplayComponents(ui.text(`### ${clip(v.title, 120) || 'Untitled broadcast'}`));
      if (v.thumb && !v.thumb.includes('%{')) c.addMediaGalleryComponents(gallery(v.thumb));
      c.addTextDisplayComponents(ui.text(`${u.name}  ·  ${num(v.views)} views  ·  ${v.duration}  ·  ${ts(v.created)}`));
      foot(c, `Video ${at + 1}/${list.length}`);
      return c;
    },
  });
}

async function cmdSchedule(ctx, name) {
  if (!name) return send(ctx, note('warning', 'Whose schedule?', 'twitch schedule <name>'));
  const u = await tw.user(name);
  const list = (await tw.schedule(u.id)).filter(s => !s.canceled);
  if (!list.length) return send(ctx, note('info', `**${u.name}** has no streams scheduled.`));
  const c = base();
  c.addSectionComponents(ui.section(`### ${u.name}'s schedule`, u.avatar));
  list.slice(0, 8).forEach(s => c.addTextDisplayComponents(ui.text(`${ts(s.start, 'F')}  (${ts(s.start)})\n**${clip(s.title, 80) || 'Stream'}**${s.category ? `  ·  ${s.category}` : ''}${s.recurring ? '  ·  weekly' : ''}`)));
  foot(c);
  return send(ctx, c);
}

async function cmdEmotes(ctx, name) {
  if (!name) return send(ctx, note('warning', 'Whose emotes?', 'twitch emotes <name>'));
  const u = await tw.user(name);
  const list = await tw.emotes(u.id);
  if (!list.length) return send(ctx, note('info', `**${u.name}** has no custom emotes.`));
  const size = 1;
  return pager(ctx, {
    total: list.length, user: userOf(ctx), send: (c) => send(ctx, c),
    render: (at) => {
      const e = list[at * size];
      const c = base().addSectionComponents(ui.section(`### ${e.name}\n${e.tier ? `Tier ${Number(e.tier) / 1000}` : e.kind === 'bitstier' ? 'Bits' : e.kind === 'follower' ? 'Follower' : 'Emote'}\n${ui.sub(`${u.name} · ${list.length} emotes`)}`, e.url));
      if (e.url) c.addMediaGalleryComponents(gallery(e.url));
      foot(c, `${at + 1}/${list.length}`);
      return c;
    },
  });
}

/* ── live alerts ───────────────────────────────────────────────────── */

const canManage = (ctx) => {
  const m = ctx.member;
  return !!m?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
};

async function notifyAdd(ctx, { name, channel, role }) {
  if (!canManage(ctx)) return send(ctx, note('error', 'You need **Manage Server** to set up live alerts.'));
  if (!name) return send(ctx, note('warning', 'Which streamer?', 'twitch notify add <name> [#channel] [@role]'));
  const guildId = ctx.guild.id;
  const count = await Notify.count({ where: { guildId } });
  if (count >= 25) return send(ctx, note('warning', 'This server already has 25 streamers. Remove one first.'));
  const u = await tw.user(name);
  const target = channel ?? ctx.channel;
  const me = ctx.guild.members.me;
  const perms = target.permissionsFor?.(me);
  if (perms && !(perms.has(PermissionFlagsBits.ViewChannel) && perms.has(PermissionFlagsBits.SendMessages))) {
    return send(ctx, note('error', `I can't send messages in <#${target.id}>.`));
  }
  const live = await tw.stream(u.id).catch(() => null);
  const [row, created] = await Notify.findOrCreate({
    where: { guildId, twitchId: u.id },
    defaults: { guildId, twitchId: u.id, login: u.login, name: u.name, channelId: target.id, roleId: role?.id ?? null, lastStreamId: live?.id ?? null, addedBy: userOf(ctx).id },
  });
  if (!created) await row.update({ channelId: target.id, roleId: role?.id ?? row.roleId, name: u.name });
  return send(ctx, note('success', `${created ? 'Added' : 'Updated'} **${u.name}**. Live alerts go to <#${target.id}>${role ? ` and ping <@&${role.id}>` : ''}.`, live ? 'They are live now, so the alert comes with their next stream.' : null));
}

async function notifyRemove(ctx, name) {
  if (!canManage(ctx)) return send(ctx, note('error', 'You need **Manage Server** to change live alerts.'));
  const l = tw.login(name);
  const n = await Notify.destroy({ where: { guildId: ctx.guild.id, login: l } });
  return send(ctx, n ? note('success', `Removed **${l}** from live alerts.`) : note('warning', `**${l || 'That streamer'}** is not in this server's alerts.`));
}

async function notifyList(ctx) {
  const rows = await Notify.findAll({ where: { guildId: ctx.guild.id }, order: [['name', 'ASC']] });
  if (!rows.length) return send(ctx, note('info', 'No live alerts yet.', 'twitch notify add <name> [#channel] [@role]'));
  const c = base().addTextDisplayComponents(ui.text(`### Live alerts (${rows.length})`));
  c.addTextDisplayComponents(ui.text(rows.map(r => `**[${r.name}](https://www.twitch.tv/${r.login})** → <#${r.channelId}>${r.roleId ? `  ·  <@&${r.roleId}>` : ''}`).join('\n')));
  foot(c);
  return send(ctx, c);
}

/* ── definition ────────────────────────────────────────────────────── */

const SUBS = [
  ['user', 'Show a channel profile', 'name', 'Twitch username', true],
  ['live', 'Is a streamer live?', 'name', 'Twitch username', true],
  ['top', 'Most watched streams, or in one category', 'game', 'Category name', false],
  ['game', 'Category info and its top streams', 'name', 'Category name', true],
  ['search', 'Find channels', 'query', 'What to look for', true],
  ['clips', 'Top clips from a streamer', 'name', 'Twitch username', true],
  ['videos', 'Latest broadcasts of a streamer', 'name', 'Twitch username', true],
  ['schedule', 'Upcoming streams of a streamer', 'name', 'Twitch username', true],
  ['emotes', 'Channel emotes', 'name', 'Twitch username', true],
];

const data = new SlashCommandBuilder().setName('twitch').setDescription('Twitch channels, streams, clips and live alerts');
for (const [name, desc, o, od, req] of SUBS) data.addSubcommand(s => s.setName(name).setDescription(desc).addStringOption(x => x.setName(o).setDescription(od).setRequired(req).setMaxLength(100)));
data.addSubcommand(s => s.setName('games').setDescription('Most popular categories right now'));
data.addSubcommandGroup(g => g.setName('notify').setDescription('Live alerts for this server')
  .addSubcommand(s => s.setName('add').setDescription('Announce when a streamer goes live')
    .addStringOption(x => x.setName('name').setDescription('Twitch username').setRequired(true).setMaxLength(100))
    .addChannelOption(x => x.setName('channel').setDescription('Where to post (default: here)'))
    .addRoleOption(x => x.setName('role').setDescription('Role to ping')))
  .addSubcommand(s => s.setName('remove').setDescription('Stop alerts for a streamer').addStringOption(x => x.setName('name').setDescription('Twitch username').setRequired(true).setMaxLength(100)))
  .addSubcommand(s => s.setName('list').setDescription('Streamers this server gets alerts for')));

const RUN = { user: cmdUser, live: cmdLive, top: cmdTop, game: cmdGame, games: cmdGames, search: cmdSearch, clips: cmdClips, videos: cmdVideos, schedule: cmdSchedule, emotes: cmdEmotes };
const ALIAS = { u: 'user', profile: 'user', stream: 'live', l: 'live', now: 'live', category: 'game', cat: 'game', categories: 'games', find: 'search', clip: 'clips', vod: 'videos', vods: 'videos', sched: 'schedule', emote: 'emotes', alerts: 'notify', alert: 'notify', notifs: 'notify' };

async function notifyText(ctx, args) {
  const act = (args[0] || 'list').toLowerCase();
  if (['remove', 'delete', 'del', 'rm'].includes(act)) return notifyRemove(ctx, args[1] || '');
  if (act === 'list') return notifyList(ctx);
  if (act !== 'add') return notifyAdd(ctx, { name: args.join(' ') });
  const rest = args.slice(1);
  const chId = rest.map(a => a.match(/^<#(\d+)>$/)?.[1]).find(Boolean);
  const roleId = rest.map(a => a.match(/^<@&(\d+)>$/)?.[1]).find(Boolean);
  const name = rest.find(a => !/^<[#@]/.test(a)) || '';
  return notifyAdd(ctx, { name, channel: chId ? ctx.guild.channels.cache.get(chId) : null, role: roleId ? ctx.guild.roles.cache.get(roleId) : null });
}

module.exports = {
  data,
  slashOptional: true,

  name: 'twitch',
  aliases: ['tw', 'ttv'],
  description: 'Twitch channels, streams, clips and live alerts',
  usage: 'twitch <user|live|top|game|games|search|clips|videos|schedule|emotes|notify> <…>',
  category: 'social',

  async execute(ctx, args = []) {
    if (isSlash(ctx)) {
      if (!ctx.deferred && !ctx.replied) await ctx.deferReply();
      const group = ctx.options.getSubcommandGroup(false);
      const sub = ctx.options.getSubcommand();
      return guarded(ctx, () => {
        if (group === 'notify') {
          if (sub === 'add') return notifyAdd(ctx, { name: ctx.options.getString('name'), channel: ctx.options.getChannel('channel'), role: ctx.options.getRole('role') });
          if (sub === 'remove') return notifyRemove(ctx, ctx.options.getString('name'));
          return notifyList(ctx);
        }
        if (sub === 'games') return cmdGames(ctx);
        const [, , o] = SUBS.find(x => x[0] === sub);
        return RUN[sub](ctx, ctx.options.getString(o) ?? '');
      });
    }

    if (!args.length) return require('../../../services/helpMenu').showCommand(ctx, 'twitch');
    ctx.channel?.sendTyping?.().catch(() => {});
    let sub = (args[0] || '').toLowerCase();
    sub = ALIAS[sub] ?? sub;
    return guarded(ctx, () => {
      if (sub === 'notify') return notifyText(ctx, args.slice(1));
      if (RUN[sub]) return RUN[sub](ctx, args.slice(1).join(' ').trim());
      return cmdUser(ctx, args.join(' ').trim());     // `twitch shroud` = profile
    });
  },
};
