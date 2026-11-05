// grace · shared helpers for antiraid, lockdown and the permission guard.

const D = require('discord.js');
const ui = require('./ui');
const { AntinukeConfig, GuardSettings } = require('../database/schemas');
const emojis = require('../media/emojis.json');

const P = D.PermissionFlagsBits;
const V2 = D.MessageFlags.IsComponentsV2;

/** Permissions that can wreck a server. */
const DANGEROUS = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.BanMembers, P.KickMembers, P.ManageWebhooks];
const DANGEROUS_NAMES = {
  [P.Administrator]: 'Administrator', [P.ManageGuild]: 'Manage Server', [P.ManageRoles]: 'Manage Roles', [P.ManageChannels]: 'Manage Channels',
  [P.BanMembers]: 'Ban Members', [P.KickMembers]: 'Kick Members', [P.ManageWebhooks]: 'Manage Webhooks',
};
const dangerMask = DANGEROUS.reduce((a, b) => a | b, 0n);
const dangerNames = (bits) => DANGEROUS.filter(p => (bits & p) === p).map(p => DANGEROUS_NAMES[p]);

const read = (guildId, scope) => GuardSettings.read(guildId, scope);
const write = (guildId, scope, patch) => GuardSettings.write(guildId, scope, patch);

/* ── notes ─────────────────────────────────────────────────────────── */
const note = (kind, icon, text, sub) => {
  const c = ui.box(kind).addTextDisplayComponents(ui.text(`${icon}  ${text}`));
  if (sub) c.addTextDisplayComponents(ui.text(ui.sub(sub)));
  return c;
};
const ok = (t, s) => note('success', emojis.success, t, s);
const bad = (t, s) => note('error', emojis.error, t, s);
const warn = (t, s) => note('warning', emojis.warning, t, s);

/* ── alerts ────────────────────────────────────────────────────────── */

const logCache = new Map();
async function logChannelId(guildId) {
  const hit = logCache.get(guildId);
  if (hit && Date.now() - hit.ts < 60_000) return hit.id;
  const row = await AntinukeConfig.findOne({ where: { guildId } }).catch(() => null);
  logCache.set(guildId, { id: row?.logChannelId ?? null, ts: Date.now() });
  return row?.logChannelId ?? null;
}

/** Post an alert card in the antinuke log channel (or `fallbackId`). Never throws. */
async function alert(guild, { kind = 'error', title, lines = [], fallbackId = null }) {
  try {
    const id = (await logChannelId(guild.id)) ?? fallbackId;
    const ch = id && guild.channels.cache.get(id);
    if (!ch?.isTextBased?.()) return false;
    const box = ui.box(kind)
      .addTextDisplayComponents(ui.text(`### ${title}`))
      .addSeparatorComponents(ui.sep(false))
      .addTextDisplayComponents(ui.text(lines.filter(Boolean).join('\n')))
      .addTextDisplayComponents(ui.text(ui.sub(`<t:${Math.floor(Date.now() / 1000)}:f>`)));
    await ch.send({ components: [box], flags: V2, allowedMentions: { parse: [] } });
    return true;
  } catch { return false; }
}

/* ── who may do what ───────────────────────────────────────────────── */

const panel = () => require('./antinukePanel');
/** Owner, extra owners and antinuke admins. */
async function canConfigure(guild, userId) { return !!(await panel().accessOf(guild, userId)); }
/** Configure rights, or the Manage Server permission (for lockdown, which should be quick to reach). */
async function canLockdown(member) {
  if (member.permissions.has(P.Administrator) || member.permissions.has(P.ManageGuild)) return true;
  return canConfigure(member.guild, member.id);
}
/** Owner, extra owner, or on the trusted list. */
async function isTrusted(guild, userId) {
  if (userId === guild.ownerId || userId === guild.client.user.id) return true;
  const a = await read(guild.id, 'antinuke');
  if (a.extraOwners.includes(userId)) return true;
  const { AntinukeWhitelist } = require('../database/schemas');
  return !!(await AntinukeWhitelist.findOne({ where: { guildId: guild.id, userId } }).catch(() => null));
}

/** Who did it, from the audit log (last 6 seconds). */
async function executorOf(guild, type, targetId = null) {
  try {
    if (!guild.members.me?.permissions.has(P.ViewAuditLog)) return null;
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const now = Date.now();
    for (const e of logs.entries.values()) {
      if (now - e.createdTimestamp > 6000) continue;
      if (!targetId || e.target?.id === targetId) return e.executor;
    }
  } catch { /* no access */ }
  return null;
}

/** Punish with the antinuke response (strip / kick / ban). Skips the owner and anyone above the bot. */
async function punish(guild, userId, reason) {
  const cfg = await AntinukeConfig.findOne({ where: { guildId: guild.id } }).catch(() => null);
  const how = cfg?.punishment || 'stripall';
  if (userId === guild.ownerId) return null;
  const member = await guild.members.fetch(userId).catch(() => null);
  const me = guild.members.me;
  if (!member || member.roles.highest.position >= me.roles.highest.position) return null;
  try {
    if (how === 'ban') await guild.members.ban(userId, { reason: `Antinuke: ${reason}` });
    else if (how === 'kick') await member.kick(`Antinuke: ${reason}`);
    else {
      const roles = member.roles.cache.filter(r => r.id !== guild.id && !r.managed && r.position < me.roles.highest.position);
      if (roles.size) await member.roles.remove(roles, `Antinuke: ${reason}`);
    }
    return how;
  } catch { return null; }
}
const PUNISH_WORD = { stripall: 'Roles stripped', kick: 'Kicked', ban: 'Banned' };

const antinukeOn = async (guildId) => !!(await AntinukeConfig.findOne({ where: { guildId } }).catch(() => null))?.enabled;

const ago = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

module.exports = {
  D, P, V2, DANGEROUS, DANGEROUS_NAMES, dangerMask, dangerNames,
  read, write, ok, bad, warn, note, alert,
  canConfigure, canLockdown, isTrusted, executorOf, punish, PUNISH_WORD, antinukeOn, ago, plural,
};
