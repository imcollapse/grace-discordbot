// grace · ,lockdown — lock the whole server at once
//   lockdown                       the panel
//   lockdown on [time] [reason]    lock every public channel      e.g. lockdown on 30m raid in progress
//   lockdown off                   unlock, every channel goes back exactly as it was
//   lockdown status
//   lockdown keep #channel         keep a channel open (again to lock it)

const { MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const ms = require('ms');
const S = require('../../services/securityKit');
const L = require('../../services/lockdown');
const ui = require('../../services/ui');

const V2 = MessageFlags.IsComponentsV2;
const send = (m, c) => m.reply({ components: [c].flat(), flags: V2, allowedMentions: { parse: [] } });

module.exports = {
  name: 'lockdown',
  description: 'Lock every channel so nobody can talk',
  aliases: ['serverlock', 'ld'],
  usage: 'lockdown [on [time] [reason] | off | status | keep #channel]',
  category: 'security',

  async execute(message, args = []) {
    if (!message.guild) return;
    if (!(await S.canLockdown(message.member))) return send(message, ui.fail('You need **Manage Server** or antinuke access for that.'));
    const guild = message.guild;
    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'panel' || sub === 'status') return send(message, await L.panel(guild));

    if (['on', 'start', 'lock'].includes(sub)) {
      if (!guild.members.me.permissions.has(P.ManageChannels)) return send(message, S.bad('I need the **Manage Channels** permission.'));
      let rest = args.slice(1);
      let minutes = 0;
      const t = rest[0] && ms(rest[0]);
      if (typeof t === 'number' && t >= 60_000) { minutes = Math.min(Math.ceil(t / 60_000), 7 * 1440); rest = rest.slice(1); }
      const reason = rest.join(' ').trim().slice(0, 200) || null;
      const wait = await message.reply({ components: [S.warn('Locking the server…')], flags: V2, allowedMentions: { parse: [] } });
      const res = await L.start(guild, { by: message.author.id, reason, minutes });
      S.alert(guild, { kind: 'error', title: 'Lockdown on', lines: [`Started by <@${message.author.id}>.`, reason && `**Reason**  ${reason}`, minutes ? `**Ends**  ${S.ago(Date.now() + minutes * 60_000)}` : null, `${res.locked} channels locked.`] });
      return wait.edit({ components: [S.ok(`Server locked. ${res.locked} channels.`, [minutes ? `Unlocks ${S.ago(Date.now() + minutes * 60_000)}.` : 'Use `lockdown off` to unlock.', res.failed ? `${res.failed} channels I couldn't change.` : null].filter(Boolean).join(' '))], flags: V2 });
    }

    if (['off', 'end', 'unlock', 'stop'].includes(sub)) {
      const st = await L.state(guild.id);
      if (!st.active) return send(message, S.warn('The server is not locked.'));
      const res = await L.end(guild);
      S.alert(guild, { kind: 'success', title: 'Lockdown ended', lines: [`Ended by <@${message.author.id}>. ${res.restored} channels are open again.`] });
      return send(message, S.ok(`Server unlocked. ${res.restored} channels restored.`, res.failed ? `${res.failed} channels I couldn't change.` : undefined));
    }

    if (['keep', 'ignore', 'open'].includes(sub)) {
      const ch = message.mentions.channels.first() || guild.channels.cache.get((args[1] || '').replace(/\D/g, ''));
      if (!ch) return send(message, S.warn('Mention the channel: `lockdown keep #rules`'));
      const st = await L.state(guild.id);
      const has = st.ignored.includes(ch.id);
      await L.setIgnored(guild, has ? st.ignored.filter(x => x !== ch.id) : [...st.ignored, ch.id]);
      return send(message, S.ok(has ? `${ch} will be locked in a lockdown.` : `${ch} stays open during a lockdown.`));
    }
    return send(message, S.warn('Unknown option.', 'Use `lockdown` to see the panel.'));
  },
};
