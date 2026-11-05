// grace · ,verify — captcha verification
//   verify setup            the configuration panel
//   verify enable|disable   switch it on or off
//   verify send             post the Verify panel in the verify channel
//   verify sync             hide every channel from the Unverified role again
//   verify approve @user    let someone in without the captcha
//   verify pending          who has not verified yet
//   verify test             try the captcha yourself
//   verify reset            remove the setup

const { PermissionFlagsBits: P, MessageFlags } = require('discord.js');
const ui = require('../../services/ui');
const V = require('../../services/verify');
const { VerifyPending } = require('../../database/schemas');

const send = (m, c, extra = {}) => m.reply({ components: [c].flat(), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] }, ...extra });
const can = (m) => m.permissions.has(P.ManageGuild) || m.permissions.has(P.Administrator);

async function findMember(message, token) {
  const direct = message.mentions.members?.first();
  if (direct) return direct;
  const id = (token || '').replace(/\D/g, '');
  return id.length >= 17 ? message.guild.members.fetch(id).catch(() => null) : null;
}

module.exports = {
  name: 'verify',
  description: 'Captcha verification for new members',
  aliases: ['verification', 'captcha'],
  usage: 'verify setup | enable | disable | send | sync | approve <user> | pending | test | reset',
  category: 'security',

  async execute(message, args = []) {
    if (!message.guild) return;
    const sub = (args[0] || '').toLowerCase();

    if (!sub) {
      return send(message, ui.box('base')
        .addTextDisplayComponents(ui.text('### Verification\nNew members get the **Unverified** role, can only see the verify channel, and solve a captcha to get in.'))
        .addSeparatorComponents(ui.sep(false))
        .addTextDisplayComponents(ui.text([
          '`verify setup`  open the configuration panel',
          '`verify enable`  /  `verify disable`',
          '`verify send`  post the Verify panel',
          '`verify sync`  hide all channels from Unverified',
          '`verify approve @user`  let someone in',
          '`verify pending`  members still waiting',
          '`verify test`  try the captcha yourself',
          '`verify reset`  remove the setup',
        ].join('\n'))));
    }

    if (!can(message.member)) return send(message, ui.fail('You need the **Manage Server** permission.'));
    const guild = message.guild;
    const c = await V.config(guild.id);

    switch (sub) {
      case 'setup': case 'config': case 'status': case 'panel':
        return send(message, await V.panel(guild, c));

      case 'enable': case 'on': {
        if (!c?.channelId || !c?.roleId) return send(message, V.warn('Set a verify channel and an Unverified role first.', 'Run `verify setup` and press Auto setup.'));
        const role = guild.roles.cache.get(c.roleId);
        if (!role) return send(message, V.bad('The Unverified role was deleted. Run `verify setup`.'));
        if (guild.members.me.roles.highest.comparePositionTo(role) <= 0) return send(message, V.bad('Move my role above the Unverified role first.'));
        await V.change(guild.id, { enabled: true });
        return send(message, V.ok('Verification is on.', 'New members must pass the captcha.'));
      }
      case 'disable': case 'off': {
        if (!c?.enabled) return send(message, V.warn('Verification is already off.'));
        await V.change(guild.id, { enabled: false });
        return send(message, V.ok('Verification is off.'));
      }

      case 'send': case 'post': {
        if (!c?.channelId) return send(message, V.warn('Set a verify channel first with `verify setup`.'));
        const res = await V.postPanel(guild, c);
        return send(message, res.ok ? V.ok(`Panel sent to <#${c.channelId}>.`) : V.bad(res.error));
      }

      case 'sync': {
        const role = guild.roles.cache.get(c?.roleId);
        if (!role) return send(message, V.warn('Set the Unverified role first with `verify setup`.'));
        const miss = V.missingPerms(guild);
        if (miss.length) return send(message, V.bad(`I need **${miss.join('** and **')}**.`));
        const res = await V.syncChannels(guild, role, c.channelId);
        return send(message, V.ok(`Hid ${res.done} channels from ${role}.`, res.failed ? `${res.failed} channels I couldn't change.` : undefined));
      }

      case 'approve': case 'allow': {
        const member = await findMember(message, args[1]);
        if (!member) return send(message, ui.warn('Mention the member: `verify approve @user`'));
        if (!c?.roleId || !member.roles.cache.has(c.roleId)) return send(message, V.warn(`${member.displayName} is already verified.`));
        await V.pass(member, { by: message.author });
        return send(message, V.ok(`<@${member.id}> is verified.`));
      }

      case 'pending': case 'waiting': {
        const rows = await VerifyPending.findAll({ where: { guildId: guild.id }, order: [['joinedAt', 'ASC']], limit: 20 });
        if (!rows.length) return send(message, V.ok('Nobody is waiting.'));
        const lines = rows.map(r => `<@${r.userId}>  ·  joined <t:${Math.floor(new Date(r.joinedAt).getTime() / 1000)}:R>`);
        return send(message, ui.box('base').addTextDisplayComponents(ui.text(`### Waiting to verify\n${lines.join('\n')}`)));
      }

      case 'test': {
        const msg = V.challenge(guild, message.author, c, { preview: true });
        return message.reply({ ...msg, allowedMentions: { parse: [] } });
      }

      case 'reset': {
        if (!c) return send(message, V.warn('Nothing to reset.'));
        return send(message, V.confirmReset());
      }
    }
    return send(message, V.warn('Unknown option.', 'Use `verify` to see what is available.'));
  },
};
