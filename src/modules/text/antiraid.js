// grace · ,antiraid — stop join floods
//   antiraid               the panel
//   antiraid on|off
//   antiraid panic [min]   raid mode right now
//   antiraid end           end raid mode

const { MessageFlags } = require('discord.js');
const S = require('../../services/securityKit');
const R = require('../../services/antiraid');
const ui = require('../../services/ui');

const V2 = MessageFlags.IsComponentsV2;
const send = (m, c) => m.reply({ components: [c].flat(), flags: V2, allowedMentions: { parse: [] } });

module.exports = {
  name: 'antiraid',
  description: 'Detect and stop join floods',
  aliases: ['raid'],
  usage: 'antiraid [on | off | panic [minutes] | end]',
  category: 'security',

  async execute(message, args = []) {
    if (!message.guild) return;
    if (!(await S.canConfigure(message.guild, message.author.id))) return send(message, ui.fail('Only the owner, extra owners and antinuke admins can use this.'));
    const guild = message.guild;
    const sub = (args[0] || '').toLowerCase();

    if (!sub || ['panel', 'setup', 'status', 'config', 'dashboard', 'settings'].includes(sub)) return send(message, await R.panel(guild));
    if (['on', 'enable'].includes(sub)) { await R.change(guild.id, { enabled: true }); return send(message, S.ok('Antiraid is on.')); }
    if (['off', 'disable'].includes(sub)) { await R.change(guild.id, { enabled: false }); return send(message, S.ok('Antiraid is off.')); }
    if (sub === 'panic') {
      const min = Math.min(Math.max(parseInt(args[1], 10) || 0, 0), 1440) || undefined;
      await R.panic(guild, { minutes: min });
      return send(message, S.ok('Raid mode is on.', 'New members get the antiraid response until it ends.'));
    }
    if (['end', 'stop', 'calm'].includes(sub)) {
      const c = await R.cfg(guild.id);
      if (!R.active(c)) return send(message, S.warn('Raid mode is not on.'));
      await R.endRaid(guild, { by: message.author.id });
      return send(message, S.ok('Raid mode ended.'));
    }
    return send(message, S.warn('Unknown option.', 'Use `antiraid` to see the panel.'));
  },
};
