// grace · antiraid / lockdown / permission guard panels.   ar:<action>  ld:<action>  pg:<action>

const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const ms = require('ms');
const ui = require('../../services/ui');
const S = require('../../services/securityKit');
const R = require('../../services/antiraid');
const L = require('../../services/lockdown');
const G = require('../../services/permGuard');
const panelSvc = require('../../services/antinukePanel');

const V2 = MessageFlags.IsComponentsV2;
const EPH = MessageFlags.Ephemeral;
const NO = { parse: [] };
const say = (i, c) => i.reply({ components: [c], flags: V2 | EPH, allowedMentions: NO });
const upd = (i, components) => i.update({ components, flags: V2, allowedMentions: NO });
const later = async (i, work) => { await i.deferUpdate(); const comps = await work(); return i.editReply({ components: comps, flags: V2, allowedMentions: NO }); };

/* ── antiraid ──────────────────────────────────────────────────────── */

async function antiraid(i, action, mod = null) {
  if (!(await S.canConfigure(i.guild, i.user.id))) { await say(i, ui.fail('Only the owner, extra owners and antinuke admins can use this.')); return true; }
  const g = i.guild;
  const v = i.values?.[0];
  const m = mod || null;
  const redraw = async (note = '', to = m) => upd(i, await R.panel(g, { note, mod: to }));
  const c = await R.cfg(g.id);

  switch (action) {
    case 'toggle': await R.change(g.id, { enabled: !c.enabled }); await redraw(c.enabled ? 'Antiraid is off.' : `${ui.emojis.success} Antiraid is on.`); return true;
    case 'joins': await R.change(g.id, { joins: Number(v) }); await redraw(); return true;
    case 'window': await R.change(g.id, { window: Number(v) }); await redraw(); return true;
    case 'action': await R.change(g.id, { action: v }); await redraw(); return true;
    case 'age': await R.change(g.id, { minAge: Number(v) }); await redraw(); return true;
    case 'agetoggle': await R.change(g.id, { minAge: c.minAge ? 0 : 3 }); await redraw(); return true;
    case 'avatar': await R.change(g.id, { noAvatar: !c.noAvatar }); await redraw(); return true;
    case 'open': await redraw('', v); return true;
    case 'home': await redraw('', null); return true;
    case 'duration': await R.change(g.id, { duration: Number(v) }); await redraw(); return true;
    case 'lock': await R.change(g.id, { autoLockdown: !c.autoLockdown }); await redraw(); return true;
    case 'level': await R.change(g.id, { raiseLevel: !c.raiseLevel }); await redraw(); return true;
    case 'panic': await later(i, async () => { await R.panic(g); return R.panel(g, { note: `${ui.emojis.warning} Raid mode is on.`, mod: m }); }); return true;
    case 'end': await later(i, async () => { await R.endRaid(g, { by: i.user.id }); return R.panel(g, { note: `${ui.emojis.success} Raid mode ended.`, mod: m }); }); return true;
  }
  return false;
}

/* ── lockdown ──────────────────────────────────────────────────────── */

async function lockdown(i, action) {
  if (!(await S.canLockdown(i.member))) { await say(i, ui.fail('You need **Manage Server** or antinuke access for that.')); return true; }
  const g = i.guild;
  const st = await L.state(g.id);

  if (i.isModalSubmit() && action === 'm_start') {
    const raw = i.fields.getTextInputValue('time').trim();
    const reason = i.fields.getTextInputValue('reason').trim().slice(0, 200) || null;
    let minutes = 0;
    if (raw) {
      const t = ms(raw);
      if (typeof t !== 'number' || t < 60_000) { await say(i, ui.fail('Give a time like `30m` or `2h`, or leave it empty.')); return true; }
      minutes = Math.min(Math.ceil(t / 60_000), 7 * 1440);
    }
    await i.deferUpdate();
    const res = await L.start(g, { by: i.user.id, reason, minutes });
    S.alert(g, { kind: 'error', title: 'Lockdown on', lines: [`Started by <@${i.user.id}>.`, reason && `**Reason**  ${reason}`, minutes ? `**Ends**  ${S.ago(Date.now() + minutes * 60_000)}` : null, `${res.locked} channels locked.`] });
    await i.editReply({ components: await L.panel(g, { note: `${ui.emojis.success} Locked ${res.locked} channels.` }), flags: V2, allowedMentions: NO });
    return true;
  }

  switch (action) {
    case 'toggle':
    case 'start':
      if (action === 'toggle' && st.active) break;
      await i.showModal(new ModalBuilder().setCustomId('ld:m_start').setTitle('Lock the server').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('time').setLabel('For how long? (30m, 2h — empty = until you unlock)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(8)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200)),
      ));
      return true;
    case 'ignore': {
      await i.deferUpdate();
      await L.setIgnored(g, [...i.channels.keys()]);
      await i.editReply({ components: await L.panel(g), flags: V2, allowedMentions: NO });
      return true;
    }
  }
  if (action === 'end' || (action === 'toggle' && st.active)) {
    if (!st.active) { await say(i, S.warn('The server is not locked.')); return true; }
    await i.deferUpdate();
    const res = await L.end(g);
    S.alert(g, { kind: 'success', title: 'Lockdown ended', lines: [`Ended by <@${i.user.id}>. ${res.restored} channels are open again.`] });
    await i.editReply({ components: await L.panel(g, { note: `${ui.emojis.success} Unlocked ${res.restored} channels.` }), flags: V2, allowedMentions: NO });
    return true;
  }
  return false;
}

/* ── permission guard ──────────────────────────────────────────────── */

async function permguard(i, action) {
  const level = await panelSvc.accessOf(i.guild, i.user.id);
  const strong = level === 'owner' || level === 'extra';
  if (!strong) { await say(i, ui.fail('Only the owner and extra owners can change the permission guard.')); return true; }
  const g = i.guild;
  const c = await G.cfg(g.id);
  const redraw = async (note = '') => upd(i, await G.panel(g, 3, { note }));

  switch (action) {
    case 'toggle':
      if (!c.enabled && !c.baselined) await G.baseline(g);
      await G.change(g.id, { enabled: !c.enabled, pausedUntil: 0 });
      await redraw(c.enabled ? 'Permission guard is off.' : `${ui.emojis.success} Permission guard is on.${(await S.antinukeOn(g.id)) ? '' : ' It only works while antinuke is on.'}`);
      return true;
    case 'roles': await G.change(g.id, { allowedRoles: [...i.roles.keys()].filter(id => id !== g.id) }); await redraw(); return true;
    case 'pause':
      await G.change(g.id, { pausedUntil: Date.now() + 10 * 60_000 });
      S.alert(g, { kind: 'warning', title: 'Permission guard paused', lines: [`<@${i.user.id}> paused it for 10 minutes.`] });
      await redraw('Paused for 10 minutes. Make your changes now.');
      return true;
    case 'resume': await G.change(g.id, { pausedUntil: 0 }); await redraw(`${ui.emojis.success} Watching again.`); return true;
    case 'strict': await G.change(g.id, { strict: !c.strict }); await redraw(); return true;
    case 'recover': await G.change(g.id, { recover: !c.recover }); await redraw(); return true;
    case 'base': { const n = await G.baseline(g); await redraw(`${ui.emojis.success} ${n} roles with powerful permissions are now approved.`); return true; }
  }
  return false;
}

async function handle(i) {
  const id = i.customId;
  if (!id) return false;
  const [scope, action, arg] = id.split(':');
  if (!['ar', 'ld', 'pg'].includes(scope)) return false;
  if (!i.inGuild()) return true;
  if (scope === 'ar') return antiraid(i, action, arg);
  if (scope === 'ld') return lockdown(i, action);
  return permguard(i, action);
}

module.exports = { handle };
