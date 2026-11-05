// grace · antiraid. Watches joins; when too many arrive too fast the server goes into raid mode:
//   · everyone who joined in the burst gets the response (kick / ban / timeout)
//   · everyone who joins while it lasts gets it too
//   · optional: lockdown the server and raise the verification level, both undone when it ends

const { GuildVerificationLevel: VL } = require('discord.js');
const S = require('./securityKit');
const emojis = require('../media/emojis.json');
const lockdown = require('./lockdown');
const { GuardSettings } = require('../database/schemas');

const ACTIONS = { kick: 'Kick', ban: 'Ban', timeout: 'Timeout (1 hour)' };
const AGE_CHOICES = [[0, 'Off'], [1, '1 day'], [3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days']];
const DURATION_CHOICES = [[5, '5 minutes'], [10, '10 minutes'], [30, '30 minutes'], [60, '1 hour'], [180, '3 hours']];
const JOIN_CHOICES = [3, 5, 8, 10, 15, 20, 30];
const WINDOW_CHOICES = [5, 10, 15, 30, 60];

const joins = new Map();   // guildId -> [{ id, ts }]

const cfg = (guildId) => S.read(guildId, 'antiraid');
const change = (guildId, patch) => S.write(guildId, 'antiraid', patch);
const active = (c) => c.activeUntil > Date.now();

async function hit(member, c, reason) {
  const g = member.guild;
  try {
    if (c.action === 'ban') await g.members.ban(member.id, { reason: `Antiraid: ${reason}`, deleteMessageSeconds: 0 });
    else if (c.action === 'timeout') {
      if (!member.moderatable) return false;
      await member.timeout(3_600_000, `Antiraid: ${reason}`);
    } else {
      if (!member.kickable) return false;
      await member.kick(`Antiraid: ${reason}`);
    }
    await change(g.id, { caught: (c.caught ?? 0) + 1 });
    c.caught = (c.caught ?? 0) + 1;
    return true;
  } catch { return false; }
}

async function startRaid(guild, c, burst) {
  const minutes = c.duration || 10;
  const patch = { activeUntil: Date.now() + minutes * 60_000 };
  const notes = [];

  if (c.raiseLevel && guild.verificationLevel < VL.High) {
    const prev = guild.verificationLevel;
    if (await guild.setVerificationLevel(VL.High, 'Antiraid').then(() => true).catch(() => false)) {
      patch.prevLevel = prev;
      notes.push('Verification level raised to High.');
    }
  }
  if (c.autoLockdown) {
    const st = await lockdown.state(guild.id);
    if (!st.active) {
      const r = await lockdown.start(guild, { reason: 'Raid detected', minutes: 0, source: 'raid' });
      patch.lockedByRaid = true;
      notes.push(`Lockdown on (${r.locked} channels).`);
    }
  }
  await change(guild.id, patch);
  Object.assign(c, patch);

  let caught = 0;
  for (const j of burst) {
    const m = guild.members.cache.get(j.id) ?? await guild.members.fetch(j.id).catch(() => null);
    if (m && !m.user.bot && await hit(m, c, 'join flood')) caught++;
  }
  S.alert(guild, {
    kind: 'error', title: 'Raid detected', fallbackId: c.logId,
    lines: [
      `**${burst.length}** members joined within **${c.window}s**.`,
      `**Response**  ${ACTIONS[c.action]}  ·  ${caught} removed`,
      `**Raid mode**  until <t:${Math.floor(patch.activeUntil / 1000)}:t>`,
      ...notes,
    ],
  });
}

/** Called for every new member. */
async function onJoin(member) {
  if (member.user.bot) return;
  const guild = member.guild;
  const c = await cfg(guild.id);
  if (!c.enabled) return;

  // young accounts
  if (c.minAge > 0) {
    const days = (Date.now() - member.user.createdTimestamp) / 86_400_000;
    if (days < c.minAge) {
      if (await hit(member, c, `account younger than ${c.minAge} days`)) {
        S.alert(guild, { kind: 'warning', title: 'New account removed', fallbackId: c.logId, lines: [`<@${member.id}> is ${Math.floor(days)} days old. Minimum is ${c.minAge}.`, `**Response**  ${ACTIONS[c.action]}`] });
        return;
      }
    }
  }

  // default profile pictures
  if (c.noAvatar && !member.user.avatar) {
    if (await hit(member, c, 'default profile picture')) {
      S.alert(guild, { kind: 'warning', title: 'Default avatar removed', fallbackId: c.logId, lines: [`<@${member.id}> has no profile picture.`, `**Response**  ${ACTIONS[c.action]}`] });
      return;
    }
  }

  // raid mode already on
  if (active(c)) {
    if (await hit(member, c, 'raid mode')) S.alert(guild, { kind: 'warning', title: 'Raid mode', fallbackId: c.logId, lines: [`<@${member.id}> tried to join. **Response**  ${ACTIONS[c.action]}`] });
    return;
  }

  const now = Date.now();
  const list = (joins.get(guild.id) ?? []).filter(j => now - j.ts < c.window * 1000);
  list.push({ id: member.id, ts: now });
  joins.set(guild.id, list);
  if (list.length >= c.joins) {
    joins.set(guild.id, []);
    await startRaid(guild, c, list);
  }
}

/** Start raid mode by hand. */
async function panic(guild, { minutes } = {}) {
  const c = await cfg(guild.id);
  if (minutes) { c.duration = minutes; }
  await startRaid(guild, c, []);
}

/** Stop raid mode and undo what it changed. */
async function endRaid(guild, { by = null } = {}) {
  const c = await cfg(guild.id);
  const patch = { activeUntil: 0, prevLevel: null, lockedByRaid: false };
  const notes = [];
  if (c.prevLevel !== null && c.prevLevel !== undefined) {
    if (await guild.setVerificationLevel(c.prevLevel, 'Antiraid ended').then(() => true).catch(() => false)) notes.push('Verification level restored.');
  }
  if (c.lockedByRaid) {
    const st = await lockdown.state(guild.id);
    if (st.active && st.source === 'raid') { const r = await lockdown.end(guild); notes.push(`Lockdown ended (${r.restored} channels).`); }
  }
  await change(guild.id, patch);
  S.alert(guild, { kind: 'success', title: 'Raid mode ended', fallbackId: c.logId, lines: [by ? `Ended by <@${by}>.` : 'The timer ran out.', ...notes] });
}

async function expire(client) {
  const rows = await GuardSettings.findAll({ where: { scope: 'antiraid' } }).catch(() => []);
  for (const r of rows) {
    const d = r.data || {};
    if (!d.activeUntil || d.activeUntil > Date.now()) continue;
    const guild = client.guilds.cache.get(r.guildId);
    if (guild) await endRaid(guild);
  }
}

/* ── panel ─────────────────────────────────────────────────────────── */
// Home: a dashboard of the modules. Open one to see and change its settings. Module state travels in the component ids.

const MODULES = [
  { value: 'flood',  label: 'Join flood',       description: 'Too many joins too fast' },
  { value: 'age',    label: 'New accounts',     description: 'Accounts that are too young' },
  { value: 'avatar', label: 'Default avatars',  description: 'Members with no profile picture' },
  { value: 'mode',   label: 'Raid mode',        description: 'What happens during a raid' },
];

const dayWord = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
const stateOf = (c, key) => ({ flood: c.enabled, age: c.minAge > 0, avatar: !!c.noAvatar, mode: c.autoLockdown || c.raiseLevel })[key];
const summary = (c, key) => ({
  flood: `${c.joins} joins in ${c.window}s`,
  age: c.minAge ? `younger than ${dayWord(c.minAge)}` : 'off',
  avatar: c.noAvatar ? 'removed' : 'allowed',
  mode: `${DURATION_CHOICES.find(([v]) => v === c.duration)?.[1] ?? `${c.duration} minutes`}`,
})[key];

async function panel(guild, { note = '', mod = null } = {}) {
  const ui = require('./ui');
  const K = require('./guardKit');
  const c = await cfg(guild.id);
  const on = active(c);
  const sel = (id, ph, opts) => ui.row(ui.select(id, ph, opts));
  const menu = (current) => K.moduleMenu('ar:open', current ? 'Choose another setting…' : 'Open a module…',
    MODULES.map(m => ({ ...m, on: stateOf(c, m.value), description: `${m.description}  ·  ${summary(c, m.value)}` })), current);

  const card = ui.box('base').addSectionComponents(K.header('Antiraid', 'Stops join floods and throwaway accounts', `ar:toggle:${mod ?? ''}`, c.enabled, false));
  card.addSeparatorComponents(ui.sep());
  if (note) card.addTextDisplayComponents(ui.text(note));

  /* ── home ── */
  if (!mod) {
    card.addTextDisplayComponents(K.strip(`Response ${ACTIONS[c.action]}`, on ? `Raid mode until <t:${Math.floor(c.activeUntil / 1000)}:t>` : 'Raid mode off', `${c.caught ?? 0} removed so far`));
    card.addTextDisplayComponents(ui.text(K.lines(MODULES.map(m => [m.label, summary(c, m.value), stateOf(c, m.value)]))));
    card.addSeparatorComponents(ui.sep(false));
    card.addTextDisplayComponents(ui.text(ui.sub('Alerts go to the antinuke log channel')));
    const controls = ui.box('base').addActionRowComponents(menu(null)).addActionRowComponents(ui.row(
      on ? ui.btn('ar:end', 'End raid mode', { style: 'success' }) : ui.btn('ar:panic', 'Raid mode now', { style: 'danger' }),
    ));
    return [card, controls];
  }

  /* ── one module ── */
  const m = MODULES.find(x => x.value === mod) ?? MODULES[0];
  const mOn = !!stateOf(c, m.value);
  const rows = {
    flood: [['Status', c.enabled ? 'Watching' : 'Antiraid is off', c.enabled], ['Trigger', `${c.joins} joins within ${c.window}s`], ['Response', ACTIONS[c.action]]],
    age: [['Status', mOn ? 'Removing' : 'Off', mOn], ['Minimum age', c.minAge ? dayWord(c.minAge) : 'Not checked'], ['Response', ACTIONS[c.action]]],
    avatar: [['Status', mOn ? 'Removing' : 'Allowed', mOn], ['Response', ACTIONS[c.action]]],
    mode: [['Lasts', DURATION_CHOICES.find(([v]) => v === c.duration)?.[1] ?? `${c.duration} minutes`], ['Lockdown', c.autoLockdown ? 'Automatic' : 'Off', c.autoLockdown], ['Verification level', c.raiseLevel ? 'Raised to High' : 'Unchanged', c.raiseLevel]],
  }[m.value];
  card.addTextDisplayComponents(K.crumb('Antiraid', m.label, m.description));
  card.addTextDisplayComponents(ui.text(K.lines(rows)));
  if (m.value !== 'flood' && m.value !== 'mode') card.addTextDisplayComponents(ui.text(ui.sub('The response is shared by every module.')));

  const buttons = {
    flood: [ui.btn('ar:toggle:flood', c.enabled ? 'Turn off' : 'Turn on', { style: c.enabled ? 'secondary' : 'success' })],
    age: [ui.btn('ar:agetoggle:age', mOn ? 'Turn off' : 'Turn on', { style: mOn ? 'secondary' : 'success' })],
    avatar: [ui.btn('ar:avatar:avatar', mOn ? 'Turn off' : 'Turn on', { style: mOn ? 'secondary' : 'success' })],
    mode: [
      ui.btn('ar:lock:mode', c.autoLockdown ? 'Lockdown: on' : 'Lockdown: off', { style: c.autoLockdown ? 'success' : 'secondary' }),
      ui.btn('ar:level:mode', c.raiseLevel ? 'Verification: raise' : 'Verification: keep', { style: c.raiseLevel ? 'success' : 'secondary' }),
    ],
  }[m.value];
  const controls = ui.box('base').addActionRowComponents(ui.row(...buttons, ui.btn('ar:home', 'Back')));
  controls.addActionRowComponents(menu(m.value));
  if (m.value === 'flood') {
    controls.addActionRowComponents(sel('ar:joins:flood', `Trigger: ${c.joins} joins…`, JOIN_CHOICES.map(n => ({ label: `${n} joins`, value: String(n), default: n === c.joins }))));
    controls.addActionRowComponents(sel('ar:window:flood', `Within: ${c.window} seconds…`, WINDOW_CHOICES.map(n => ({ label: `${n} seconds`, value: String(n), default: n === c.window }))));
  }
  if (m.value === 'age') controls.addActionRowComponents(sel('ar:age:age', 'Remove accounts younger than…', AGE_CHOICES.map(([v, l]) => ({ label: v ? `Younger than ${l}` : 'Off', value: String(v), default: v === c.minAge }))));
  if (m.value === 'mode') controls.addActionRowComponents(sel('ar:duration:mode', 'Raid mode lasts…', DURATION_CHOICES.map(([v, l]) => ({ label: l, value: String(v), default: v === c.duration }))));
  if (m.value !== 'mode') controls.addActionRowComponents(sel(`ar:action:${m.value}`, `Response: ${ACTIONS[c.action]}`, Object.entries(ACTIONS).map(([v, l]) => ({ label: l, value: v, default: v === c.action }))));
  return [card, controls];
}

module.exports = { ACTIONS, onJoin, panic, endRaid, expire, panel, cfg, change, active };
