// grace · ,permguard — keep powerful permissions where you approved them
//   permguard                 the panel
//   permguard on|off
//   permguard allow @role     approve a role
//   permguard deny @role      take the approval away
//   permguard pause [min]     pause it so you can change things yourself
//   permguard resume

const { MessageFlags } = require('discord.js');
const S = require('../../services/securityKit');
const G = require('../../services/permGuard');
const ui = require('../../services/ui');
const panelSvc = require('../../services/antinukePanel');

const V2 = MessageFlags.IsComponentsV2;
const send = (m, c) => m.reply({ components: [c].flat(), flags: V2, allowedMentions: { parse: [] } });

module.exports = {
  name: 'permguard',
  description: 'Revert dangerous permission changes, even the owner\'s',
  aliases: ['permissionguard', 'pg'],
  usage: 'permguard [on | off | allow @role | deny @role | pause [minutes] | resume]',
  category: 'security',

  async execute(message, args = []) {
    if (!message.guild) return;
    const guild = message.guild;
    const level = await panelSvc.accessOf(guild, message.author.id);
    if (!level) return send(message, ui.fail('Only the owner, extra owners and antinuke admins can use this.'));
    const strong = level === 'owner' || level === 'extra';
    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'panel' || sub === 'status') {
      const c = await G.cfg(guild.id);
      if (!c.baselined) await G.baseline(guild);
      return send(message, await G.panel(guild, strong ? 3 : 1));
    }
    if (!strong) return send(message, ui.fail('Only the owner and extra owners can change the permission guard.'));

    if (['on', 'enable'].includes(sub)) {
      const c = await G.cfg(guild.id);
      if (!c.baselined) await G.baseline(guild);
      await G.change(guild.id, { enabled: true, pausedUntil: 0 });
      return send(message, S.ok('Permission guard is on.', (await S.antinukeOn(guild.id)) ? undefined : 'It only works while antinuke is on.'));
    }
    if (['off', 'disable'].includes(sub)) { await G.change(guild.id, { enabled: false }); return send(message, S.ok('Permission guard is off.')); }

    if (sub === 'allow' || sub === 'deny') {
      const role = message.mentions.roles.first() || guild.roles.cache.get((args[1] || '').replace(/\D/g, ''));
      if (!role || role.id === guild.id) return send(message, S.warn(`Mention the role: \`permguard ${sub} @role\``));
      const c = await G.cfg(guild.id);
      const set = new Set(c.allowedRoles);
      sub === 'allow' ? set.add(role.id) : set.delete(role.id);
      await G.change(guild.id, { allowedRoles: [...set].slice(0, 50) });
      return send(message, S.ok(sub === 'allow' ? `${role} may hold powerful permissions.` : `${role} is no longer approved.`));
    }

    if (sub === 'pause') {
      const min = Math.min(Math.max(parseInt(args[1], 10) || 10, 1), 120);
      await G.change(guild.id, { pausedUntil: Date.now() + min * 60_000 });
      S.alert(guild, { kind: 'warning', title: 'Permission guard paused', lines: [`<@${message.author.id}> paused it for ${min} minutes.`] });
      return send(message, S.ok(`Paused for ${min} minutes.`, 'Make your changes now. It resumes by itself.'));
    }
    if (sub === 'resume') { await G.change(guild.id, { pausedUntil: 0 }); return send(message, S.ok('Permission guard is watching again.')); }

    return send(message, S.warn('Unknown option.', 'Use `permguard` to see the panel.'));
  },
};
