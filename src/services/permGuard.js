// grace · permission guard. Powerful permissions (Administrator, Manage Server/Roles/Channels/Webhooks,
// Ban/Kick) may only sit on roles you have approved. Anything else is put back, WHOEVER makes the change,
// the server owner included, unless the guard is paused or Strict mode is off.
//
//   @everyone gains a powerful permission     → reverted
//   a role gains one / is created with one    → reverted
//   a member is given a role that has one     → role taken back
//   strangers who did it                      → the antinuke punishment too
//   channels and roles deleted by strangers   → recreated (optional)

const { AuditLogEvent: A, PermissionFlagsBits: P } = require('discord.js');
const S = require('./securityKit');

const cfg = (guildId) => S.read(guildId, 'permguard');
const change = (guildId, patch) => S.write(guildId, 'permguard', patch);
const paused = (c) => c.pausedUntil > Date.now();

const EVERYONE_MASK = S.dangerMask | P.MentionEveryone;
const names = (bits, everyone) => [...S.dangerNames(bits), ...(everyone && (bits & P.MentionEveryone) ? ['Mention Everyone'] : [])];

/** Is the guard watching right now? */
async function watching(guild) {
  const c = await cfg(guild.id);
  if (!c.enabled || paused(c)) return null;
  if (!(await S.antinukeOn(guild.id))) return null;
  return c;
}

/** Decide what to do about whoever made the change. @returns { skip, trusted, who } */
async function judge(guild, c, executor) {
  if (executor?.id === guild.client.user.id) return { skip: true };
  const trusted = executor ? await S.isTrusted(guild, executor.id) : false;
  if (trusted && !c.strict) return { skip: true };
  return { skip: false, trusted, who: executor ? `<@${executor.id}>` : 'someone' };
}

async function report(guild, c, { title, lines, executor, trusted, ok }) {
  await change(guild.id, { fixed: (c.fixed ?? 0) + 1 });
  let punished = null;
  if (executor && !trusted) punished = await S.punish(guild, executor.id, title);
  await S.alert(guild, {
    kind: ok ? 'warning' : 'error', title: `Permission guard: ${title}`,
    lines: [
      ...lines,
      punished ? `**Response**  ${S.PUNISH_WORD[punished]}` : trusted ? '**Response**  None. Trusted members are only reverted.' : null,
      ok ? null : "I couldn't undo it. Check that my role is above that role.",
    ],
  });
}

/* ── roles ─────────────────────────────────────────────────────────── */

async function onRoleUpdate(oldRole, newRole) {
  if (newRole.managed) return;
  const guild = newRole.guild;
  const c = await watching(guild); if (!c) return;
  const everyone = newRole.id === guild.id;
  const mask = everyone ? EVERYONE_MASK : S.dangerMask;
  const gained = newRole.permissions.bitfield & ~oldRole.permissions.bitfield & mask;
  if (!gained) return;
  if (!everyone && (c.allowedRoles.includes(newRole.id) || oldRole.permissions.has(P.Administrator))) return;

  const executor = await S.executorOf(guild, A.RoleUpdate, newRole.id);
  const j = await judge(guild, c, executor); if (j.skip) return;

  const ok = await newRole.setPermissions(newRole.permissions.bitfield & ~gained, 'Permission guard').then(() => true).catch(() => false);
  await report(guild, c, {
    title: everyone ? '@everyone was given powerful permissions' : `${newRole.name} was given powerful permissions`,
    lines: [`**Role**  ${everyone ? '@everyone' : `<@&${newRole.id}>`}`, `**Permissions**  ${names(gained, everyone).join(', ')}`, `**Changed by**  ${j.who}`, ok ? '**Reverted**  yes' : null],
    executor, trusted: j.trusted, ok,
  });
}

async function onRoleCreate(role) {
  if (role.managed) return;
  const guild = role.guild;
  const c = await watching(guild); if (!c) return;
  const gained = role.permissions.bitfield & S.dangerMask;
  if (!gained || c.allowedRoles.includes(role.id)) return;

  const executor = await S.executorOf(guild, A.RoleCreate, role.id);
  const j = await judge(guild, c, executor); if (j.skip) return;

  const ok = await role.setPermissions(role.permissions.bitfield & ~S.dangerMask, 'Permission guard').then(() => true).catch(() => false);
  await report(guild, c, {
    title: `${role.name} was created with powerful permissions`,
    lines: [`**Role**  <@&${role.id}>`, `**Permissions**  ${names(gained).join(', ')}`, `**Created by**  ${j.who}`, ok ? '**Reverted**  yes' : null],
    executor, trusted: j.trusted, ok,
  });
}

/* ── members ───────────────────────────────────────────────────────── */

async function onMemberUpdate(oldMember, newMember) {
  const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id) && !r.managed && (r.permissions.bitfield & S.dangerMask));
  if (!added.size) return;
  const guild = newMember.guild;
  const c = await watching(guild); if (!c) return;
  const risky = added.filter(r => !c.allowedRoles.includes(r.id));
  if (!risky.size) return;

  const executor = await S.executorOf(guild, A.MemberRoleUpdate, newMember.id);
  const j = await judge(guild, c, executor); if (j.skip) return;

  const ok = await newMember.roles.remove(risky, 'Permission guard').then(() => true).catch(() => false);
  const list = risky.map(r => `<@&${r.id}>`).join(' ');
  const gained = risky.reduce((m, r) => m | r.permissions.bitfield, 0n) & S.dangerMask;
  await report(guild, c, {
    title: 'A powerful role was handed out',
    lines: [`**Member**  <@${newMember.id}>`, `**Role**  ${list}`, `**Permissions**  ${names(gained).join(', ')}`, `**Given by**  ${j.who}`, ok ? '**Taken back**  yes' : null],
    executor, trusted: j.trusted, ok,
  });
}

/* ── recovery ──────────────────────────────────────────────────────── */

async function onChannelDelete(channel) {
  const guild = channel.guild;
  if (!guild || channel.isThread?.()) return;
  const c = await watching(guild); if (!c?.recover) return;
  const executor = await S.executorOf(guild, A.ChannelDelete, channel.id);
  if (!executor || await S.isTrusted(guild, executor.id)) return;
  try {
    const made = await guild.channels.create({
      name: channel.name, type: channel.type, topic: channel.topic ?? undefined, nsfw: channel.nsfw, parent: channel.parentId ?? undefined,
      rateLimitPerUser: channel.rateLimitPerUser || undefined, bitrate: channel.bitrate || undefined, userLimit: channel.userLimit || undefined,
      permissionOverwrites: channel.permissionOverwrites.cache.map(o => ({ id: o.id, type: o.type, allow: o.allow, deny: o.deny })),
      position: channel.rawPosition, reason: 'Permission guard: restoring a deleted channel',
    });
    S.alert(guild, { kind: 'warning', title: 'Channel restored', lines: [`**${channel.name}** was deleted by <@${executor.id}>. It is back as <#${made.id}>.`, 'Messages cannot be restored.'] });
  } catch { /* missing permissions */ }
}

async function onRoleDelete(role) {
  const guild = role.guild;
  if (role.managed) return;
  const c = await watching(guild); if (!c?.recover) return;
  const executor = await S.executorOf(guild, A.RoleDelete, role.id);
  if (!executor || await S.isTrusted(guild, executor.id)) return;
  try {
    const members = [...role.members.values()].slice(0, 100);
    const made = await guild.roles.create({
      name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable,
      permissions: role.permissions.bitfield & ~(c.allowedRoles.includes(role.id) ? 0n : S.dangerMask),
      reason: 'Permission guard: restoring a deleted role',
    });
    await made.setPosition(role.position).catch(() => {});
    for (const m of members) await m.roles.add(made, 'Permission guard: restoring a deleted role').catch(() => {});
    if (c.allowedRoles.includes(role.id)) await change(guild.id, { allowedRoles: [...c.allowedRoles.filter(x => x !== role.id), made.id] });
    S.alert(guild, { kind: 'warning', title: 'Role restored', lines: [`**${role.name}** was deleted by <@${executor.id}>. It is back as <@&${made.id}> with ${members.length} members.`] });
  } catch { /* missing permissions */ }
}

/* ── baseline: roles that already hold powerful permissions are the approved ones ── */

async function baseline(guild) {
  await guild.roles.fetch().catch(() => null);
  const ids = guild.roles.cache.filter(r => r.id !== guild.id && !r.managed && (r.permissions.bitfield & S.dangerMask)).map(r => r.id);
  await change(guild.id, { allowedRoles: ids.slice(0, 50), baselined: true });
  return ids.length;
}

async function baselineAll(client) {
  const { AntinukeConfig } = require('../database/schemas');
  const rows = await AntinukeConfig.findAll({ where: { enabled: true } }).catch(() => []);
  for (const r of rows) {
    const guild = client.guilds.cache.get(r.guildId);
    if (!guild) continue;
    const c = await cfg(guild.id);
    if (!c.baselined) await baseline(guild).catch(() => {});
  }
}

/* ── panel ─────────────────────────────────────────────────────────── */

async function panel(guild, level = 1, { note = '' } = {}) {
  const ui = require('./ui');
  const K = require('./guardKit');
  const { RoleSelectMenuBuilder } = require('discord.js');
  const c = await cfg(guild.id);
  const off = level < 2;

  const card = ui.box('base').addSectionComponents(K.header('Permission guard', 'Powerful permissions only stay where you approved them', 'pg:toggle', c.enabled, off));
  card.addSeparatorComponents(ui.sep());
  if (note) card.addTextDisplayComponents(ui.text(note));
  const allowed = c.allowedRoles.filter(id => guild.roles.cache.has(id));
  card.addTextDisplayComponents(ui.text([
    `**Status**  ${!c.enabled ? 'Off' : paused(c) ? `Paused until <t:${Math.floor(c.pausedUntil / 1000)}:t>` : 'Watching'}`,
    `**Applies to**  ${c.strict ? 'Everyone, the owner included' : 'Everyone except the owner, extra owners and trusted members'}`,
    `**Approved roles**  ${allowed.length ? allowed.slice(0, 15).map(id => `<@&${id}>`).join(' ') + (allowed.length > 15 ? ` +${allowed.length - 15}` : '') : 'None'}`,
    `**Restore deleted channels and roles**  ${c.recover ? 'On' : 'Off'}`,
    `**Fixed so far**  ${c.fixed ?? 0}`,
  ].join('\n')));
  card.addTextDisplayComponents(ui.text(ui.sub('Only works while antinuke is on. To make a change yourself, press Pause first.')));

  const sel = new RoleSelectMenuBuilder().setCustomId('pg:roles').setPlaceholder('Roles allowed to hold powerful permissions…').setMinValues(0).setMaxValues(25).setDisabled(off);
  if (allowed.length) sel.setDefaultRoles(allowed.slice(0, 25));
  const controls = ui.box('base')
    .addActionRowComponents(ui.row(sel))
    .addActionRowComponents(ui.row(
      paused(c) ? ui.btn('pg:resume', 'Resume', { style: 'success' }) : ui.btn('pg:pause', 'Pause 10 min', { style: 'primary', disabled: !c.enabled }),
      ui.btn('pg:strict', c.strict ? 'Strict: on' : 'Strict: off', { style: c.strict ? 'success' : 'secondary', disabled: off }),
      ui.btn('pg:recover', c.recover ? 'Restore: on' : 'Restore: off', { style: c.recover ? 'success' : 'secondary', disabled: off }),
      ui.btn('pg:base', 'Approve current', { disabled: off }),
    ));
  return [card, controls];
}

module.exports = { cfg, change, baseline, baselineAll, panel, onRoleUpdate, onRoleCreate, onMemberUpdate, onChannelDelete, onRoleDelete, paused };
