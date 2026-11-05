// grace · captcha verification.
//
//  New members get the "Unverified" role (hidden from every channel but the verify channel), are pinged in
//  the verify channel and solve a captcha in a modal. Passing removes the role.
//
//   config / bust          cached per-server setup
//   onJoin / onLeave       event hooks
//   challenge / check      the captcha itself (sessions live in memory)
//   pass                   let someone in (captcha or manual approval)
//   setup helpers          create role + channel, hide channels, post the panel
//   panel                  the configuration card

const {
  PermissionFlagsBits: P, ChannelType, MessageFlags, AttachmentBuilder, ActionRowBuilder,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, SectionBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const ui = require('./ui');
const emojis = require('../media/emojis.json');
const captcha = require('./captchaCard');
const { applyVars } = require('./embedVars');
const { VerifyConfig, VerifyPending } = require('../database/schemas');

const V2 = MessageFlags.IsComponentsV2;
const TICK = emojis.success, CROSS = emojis.error, WARN = emojis.warning;
const DEFAULT_TEXT = 'Press **Verify** and type the code from the picture to unlock **{server}**.';
const KICK_CHOICES = [[0, 'Never'], [5, '5 minutes'], [10, '10 minutes'], [30, '30 minutes'], [60, '1 hour'], [360, '6 hours'], [1440, '24 hours']];
const SESSION_MS = 5 * 60_000;
const LOCK_MS = 5 * 60_000;

/* ── storage ───────────────────────────────────────────────────────── */

const cache = new Map();
const TTL = 15_000;
async function config(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.ts < TTL) return hit.row;
  const row = await VerifyConfig.findByPk(guildId);
  cache.set(guildId, { ts: Date.now(), row });
  return row;
}
const bust = (guildId) => cache.delete(guildId);
async function change(guildId, patch) {
  const row = (await VerifyConfig.findByPk(guildId)) ?? await VerifyConfig.create({ guildId });
  await row.update(patch);
  bust(guildId);
  return row;
}
const isReady = (c) => !!(c?.enabled && c.channelId && c.roleId);

/* ── small views ───────────────────────────────────────────────────── */

function note(kind, icon, text, sub) {
  const c = ui.box(kind).addTextDisplayComponents(ui.text(`${icon}  ${text}`));
  if (sub) c.addTextDisplayComponents(ui.text(ui.sub(sub)));
  return c;
}
const ok = (t, s) => note('success', TICK, t, s);
const bad = (t, s) => note('error', CROSS, t, s);
const warn = (t, s) => note('warning', WARN, t, s);

const kickLabel = (m) => (KICK_CHOICES.find(([v]) => v === m)?.[1] ?? `${m} minutes`);

/* ── captcha sessions ──────────────────────────────────────────────── */

const sessions = new Map();   // `${guild}:${user}` -> { code, left, exp, lock }
const sk = (g, u) => `${g}:${u}`;
setInterval(() => { const n = Date.now(); for (const [k, s] of sessions) if ((s.exp || 0) < n && (s.lock || 0) < n) sessions.delete(k); }, 60_000).unref?.();

/** A fresh captcha message for a member. `preview` doesn't keep a session. */
function challenge(guild, user, c, { note: text, preview = false } = {}) {
  const key = sk(guild.id, user.id);
  const old = sessions.get(key);
  const card = captcha.render(captcha.makeCode(c?.length || 5));
  if (!preview) sessions.set(key, { code: card.code, left: old?.left ?? c?.attempts ?? 3, exp: Date.now() + SESSION_MS });

  const box = ui.box('base')
    .addTextDisplayComponents(ui.text(`### Verification${preview ? '  ·  preview' : ''}\n${preview ? ui.sub('Nothing happens when you solve this one.') : 'Type the code you see below.'}`))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://captcha.png')));
  if (text) box.addTextDisplayComponents(ui.text(text));
  if (!preview) {
    const left = sessions.get(key).left;
    box.addTextDisplayComponents(ui.text(ui.sub(`${left} ${left === 1 ? 'try' : 'tries'} left  ·  code expires in 5 minutes`)));
  }
  box.addActionRowComponents(ui.row(
    ui.btn(preview ? 'verify:noop' : 'verify:enter', 'Enter code', { style: 'primary', disabled: preview }),
    ui.btn(preview ? 'verify:noop2' : 'verify:new', 'New code', { disabled: preview }),
  ));
  return { components: [box], files: [new AttachmentBuilder(card.buffer, { name: 'captcha.png' })], flags: V2 };
}

function codeModal() {
  return new ModalBuilder().setCustomId('verify:modal').setTitle('Verification')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('code').setLabel('Code from the image').setStyle(TextInputStyle.Short)
        .setRequired(true).setMinLength(3).setMaxLength(10).setPlaceholder('e.g. K4PXR')));
}

/** Compare a typed code. @returns { status: 'pass'|'wrong'|'locked'|'none', left? } */
function check(guild, user, typed) {
  const key = sk(guild.id, user.id);
  const s = sessions.get(key);
  if (s?.lock && s.lock > Date.now()) return { status: 'locked', until: s.lock };
  if (!s?.code || s.exp < Date.now()) return { status: 'none' };
  if (String(typed).trim().toUpperCase().replace(/\s+/g, '') === s.code) { sessions.delete(key); return { status: 'pass' }; }
  s.left -= 1;
  if (s.left <= 0) { sessions.set(key, { lock: Date.now() + LOCK_MS, exp: 0 }); return { status: 'locked', until: Date.now() + LOCK_MS, out: true }; }
  return { status: 'wrong', left: s.left };
}
const lockedUntil = (guild, user) => { const s = sessions.get(sk(guild.id, user.id)); return s?.lock > Date.now() ? s.lock : 0; };

/* ── logging ───────────────────────────────────────────────────────── */

async function log(guild, c, text) {
  const ch = c?.logId && guild.channels.cache.get(c.logId);
  if (!ch?.isTextBased?.()) return;
  ch.send({ components: [ui.box('base').addTextDisplayComponents(ui.text(text))], flags: V2, allowedMentions: { parse: [] } }).catch(() => {});
}

/* ── member flow ───────────────────────────────────────────────────── */

async function forget(guild, userId) {
  const row = await VerifyPending.findOne({ where: { guildId: guild.id, userId } });
  if (!row) return;
  if (row.messageId && row.channelId) guild.channels.cache.get(row.channelId)?.messages.delete(row.messageId).catch(() => {});
  await row.destroy();
}

/** Join: give the Unverified role and ping them in the verify channel. */
async function onJoin(member) {
  if (member.user.bot) return;
  const guild = member.guild;
  const c = await config(guild.id);
  if (!isReady(c)) return;
  const role = guild.roles.cache.get(c.roleId);
  const channel = guild.channels.cache.get(c.channelId);
  if (!role || !channel?.isTextBased?.()) return;

  await member.roles.add(role, 'Verification: new member').catch((e) => console.error('[verify] role:', e.message));

  const box = ui.box('base')
    .addTextDisplayComponents(ui.text(`### Welcome, <@${member.id}>\nSolve a quick captcha to unlock **${guild.name}**.${c.kickAfter ? `\n${ui.sub(`You have ${kickLabel(c.kickAfter).toLowerCase()}.`)}` : ''}`))
    .addActionRowComponents(ui.row(ui.btn('verify:go', 'Verify', { style: 'success' })));
  const msg = await channel.send({ components: [box], flags: V2, allowedMentions: { users: [member.id] } }).catch(() => null);

  await VerifyPending.destroy({ where: { guildId: guild.id, userId: member.id } });
  await VerifyPending.create({ guildId: guild.id, userId: member.id, channelId: channel.id, messageId: msg?.id ?? null });
}

const onLeave = (member) => forget(member.guild, member.id).catch(() => {});

/** Let someone in: take the Unverified role, give the Verified role, tidy up. */
async function pass(member, { by = null } = {}) {
  const guild = member.guild;
  const c = await config(guild.id);
  if (c?.roleId && member.roles.cache.has(c.roleId)) await member.roles.remove(c.roleId, by ? `Verified by ${by.tag ?? by.id}` : 'Passed the captcha');
  if (c?.verifiedId) await member.roles.add(c.verifiedId, 'Verified').catch(() => {});
  await forget(guild, member.id);
  if (c) await change(guild.id, { verified: (c.verified ?? 0) + 1 });
  log(guild, c, `${TICK}  <@${member.id}> was verified${by ? ` by <@${by.id}>` : ''}.`);
}

async function failed(guild, user) {
  const c = await config(guild.id);
  if (c) await change(guild.id, { failed: (c.failed ?? 0) + 1 });
  log(guild, c, `${CROSS}  <@${user.id}> used up their tries.`);
}

/** Kick everyone whose time ran out. */
async function expire(client) {
  const cfgs = await VerifyConfig.findAll({ where: { enabled: true } });
  for (const c of cfgs) {
    if (!c.kickAfter || !c.roleId) continue;
    const guild = client.guilds.cache.get(c.guildId);
    if (!guild || !guild.members.me?.permissions.has(P.KickMembers)) continue;
    const cutoff = new Date(Date.now() - c.kickAfter * 60_000);
    const rows = await VerifyPending.findAll({ where: { guildId: c.guildId } });
    for (const r of rows) {
      if (new Date(r.joinedAt) > cutoff) continue;
      const member = await guild.members.fetch(r.userId).catch(() => null);
      if (member && member.roles.cache.has(c.roleId) && member.kickable) {
        await member.kick('Did not verify in time').catch(() => {});
        log(guild, c, `${CROSS}  <@${r.userId}> was removed: not verified in ${kickLabel(c.kickAfter).toLowerCase()}.`);
      }
      await forget(guild, r.userId);
    }
  }
}

/* ── setup helpers ─────────────────────────────────────────────────── */

const missingPerms = (guild) => [['ManageRoles', 'Manage Roles'], ['ManageChannels', 'Manage Channels']]
  .filter(([k]) => !guild.members.me.permissions.has(P[k])).map(([, n]) => n);

async function createRole(guild) {
  return guild.roles.create({ name: 'Unverified', color: 0x9aa4b2, permissions: [], mentionable: false, reason: 'Verification setup' });
}

async function createChannel(guild, role) {
  const me = guild.members.me;
  return guild.channels.create({
    name: 'verify', type: ChannelType.GuildText, topic: 'Solve the captcha to unlock the server.',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: role.id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions] },
      { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ManageMessages] },
    ],
    reason: 'Verification setup',
  });
}

/** Hide every channel from the Unverified role, except the verify channel. */
async function syncChannels(guild, role, verifyId) {
  let done = 0, failedN = 0;
  const list = [...guild.channels.cache.values()].filter(ch => ch.permissionOverwrites && !ch.isThread?.());
  for (const ch of list) {
    try {
      if (ch.id === verifyId) await ch.permissionOverwrites.edit(role, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false }, { reason: 'Verification sync' });
      else await ch.permissionOverwrites.edit(role, { ViewChannel: false }, { reason: 'Verification sync' });
      done++;
    } catch { failedN++; }
  }
  return { done, failed: failedN };
}

/** New channels are hidden from Unverified straight away. */
async function protectChannel(channel) {
  if (!channel.guild || channel.isThread?.() || !channel.permissionOverwrites) return;
  const c = await config(channel.guild.id);
  if (!c?.roleId || channel.id === c.channelId) return;
  const role = channel.guild.roles.cache.get(c.roleId);
  if (role) await channel.permissionOverwrites.edit(role, { ViewChannel: false }, { reason: 'Verification: new channel' }).catch(() => {});
}

/** Post (or replace) the Verify panel in the verify channel. */
async function postPanel(guild, c) {
  const channel = guild.channels.cache.get(c.channelId);
  if (!channel?.isTextBased?.()) return { ok: false, error: 'The verify channel no longer exists.' };
  if (!channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages])) return { ok: false, error: `I can't send messages in <#${channel.id}>.` };
  const text = applyVars(c.message || DEFAULT_TEXT, { guild }).slice(0, 1500);
  const box = ui.box('base')
    .addTextDisplayComponents(ui.text(`### Verification\n${text}`))
    .addSeparatorComponents(ui.sep())
    .addActionRowComponents(ui.row(ui.btn('verify:go', 'Verify', { style: 'success' })));
  if (c.panelId) await channel.messages.delete(c.panelId).catch(() => {});
  const msg = await channel.send({ components: [box], flags: V2, allowedMentions: { parse: [] } }).catch((e) => ({ error: e.message }));
  if (msg.error) return { ok: false, error: msg.error };
  await change(guild.id, { panelId: msg.id });
  return { ok: true, message: msg };
}

/** Undo everything: role, channel overwrites stay clean because the role goes away. */
async function reset(guild) {
  const c = await config(guild.id);
  if (!c) return;
  const pend = await VerifyPending.findAll({ where: { guildId: guild.id } });
  for (const r of pend) await forget(guild, r.userId);
  if (c.panelId && c.channelId) await guild.channels.cache.get(c.channelId)?.messages.delete(c.panelId).catch(() => {});
  await guild.roles.cache.get(c.roleId)?.delete('Verification reset').catch(() => {});
  await VerifyConfig.destroy({ where: { guildId: guild.id } });
  bust(guild.id);
}

/* ── panel ─────────────────────────────────────────────────────────── */

const role = (guild, id) => (id && guild.roles.cache.has(id) ? `<@&${id}>` : '`Not set`');
const chan = (guild, id) => (id && guild.channels.cache.has(id) ? `<#${id}>` : '`Not set`');

/** @param view 'main' | 'more' */
async function panel(guild, c, { view = 'main', note: text = '' } = {}) {
  const cur = c ?? { enabled: false, attempts: 3, kickAfter: 0, length: 5, verified: 0, failed: 0 };
  const pending = await VerifyPending.count({ where: { guildId: guild.id } }).catch(() => 0);
  const missing = [!cur.channelId && 'verify channel', !cur.roleId && 'Unverified role'].filter(Boolean);

  const toggle = ui.btn('vfy:toggle', cur.enabled ? 'Disable' : 'Enable', { style: cur.enabled ? 'danger' : 'success' });
  const head = new SectionBuilder().addTextDisplayComponents(ui.text('### Verification\n-# Captcha check for new members')).setButtonAccessory(toggle);

  const info = [
    `**Status**  ${cur.enabled ? `${emojis.toggle_on} On` : `${emojis.toggle_off} Off`}`,
    `**Verify channel**  ${chan(guild, cur.channelId)}`,
    `**Unverified role**  ${role(guild, cur.roleId)}`,
    `**Verified role**  ${cur.verifiedId ? role(guild, cur.verifiedId) : '`None`'}`,
    `**Log channel**  ${cur.logId ? chan(guild, cur.logId) : '`None`'}`,
    `**Tries**  ${cur.attempts}   **Code length**  ${cur.length}   **Kick after**  ${kickLabel(cur.kickAfter)}`,
    `**Verified**  ${cur.verified}   **Failed**  ${cur.failed}   **Waiting**  ${pending}`,
  ].join('\n');

  const card = ui.box('base').addSectionComponents(head).addSeparatorComponents(ui.sep());
  if (text) card.addTextDisplayComponents(ui.text(text));
  card.addTextDisplayComponents(ui.text(info));
  if (missing.length) card.addTextDisplayComponents(ui.text(ui.sub(`Needs a ${missing.join(' and a ')} before it can be turned on. Press Auto setup to create them.`)));
  else card.addTextDisplayComponents(ui.text(ui.sub('Members without the Unverified role are not affected.')));

  const controls = ui.box('base');
  if (view === 'main') {
    const chSel = new ChannelSelectMenuBuilder().setCustomId('vfy:channel').setPlaceholder('Verify channel…').setChannelTypes(ChannelType.GuildText);
    if (guild.channels.cache.has(cur.channelId)) chSel.setDefaultChannels(cur.channelId);
    const roleSel = new RoleSelectMenuBuilder().setCustomId('vfy:role').setPlaceholder('Unverified role…');
    if (guild.roles.cache.has(cur.roleId)) roleSel.setDefaultRoles(cur.roleId);
    const vSel = new RoleSelectMenuBuilder().setCustomId('vfy:verified').setPlaceholder('Role to give after verifying (optional)…').setMinValues(0).setMaxValues(1);
    if (guild.roles.cache.has(cur.verifiedId)) vSel.setDefaultRoles(cur.verifiedId);
    controls
      .addActionRowComponents(new ActionRowBuilder().addComponents(chSel))
      .addActionRowComponents(new ActionRowBuilder().addComponents(roleSel))
      .addActionRowComponents(new ActionRowBuilder().addComponents(vSel))
      .addActionRowComponents(ui.row(
        ui.btn('vfy:auto', 'Auto setup', { style: 'success' }),
        ui.btn('vfy:sync', 'Hide channels'),
        ui.btn('vfy:post', 'Send panel', { style: 'primary' }),
        ui.btn('vfy:test', 'Test'),
      ))
      .addActionRowComponents(ui.row(
        ui.btn('vfy:text', 'Panel text'),
        ui.btn('vfy:more', 'More'),
        ui.btn('vfy:reset', 'Reset', { style: 'danger' }),
      ));
  } else {
    const logSel = new ChannelSelectMenuBuilder().setCustomId('vfy:log').setPlaceholder('Log channel (optional)…').setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1);
    if (guild.channels.cache.has(cur.logId)) logSel.setDefaultChannels(cur.logId);
    controls
      .addActionRowComponents(new ActionRowBuilder().addComponents(logSel))
      .addActionRowComponents(ui.row(ui.select('vfy:attempts', `Tries: ${cur.attempts}`, [1, 2, 3, 5, 10].map(n => ({ label: `${n} ${n === 1 ? 'try' : 'tries'}`, value: String(n), default: n === cur.attempts })))))
      .addActionRowComponents(ui.row(ui.select('vfy:length', `Code length: ${cur.length}`, [4, 5, 6, 7].map(n => ({ label: `${n} characters`, value: String(n), default: n === cur.length })))))
      .addActionRowComponents(ui.row(ui.select('vfy:kick', `Kick if not verified: ${kickLabel(cur.kickAfter).toLowerCase()}`, KICK_CHOICES.map(([v, l]) => ({ label: l, value: String(v), default: v === cur.kickAfter })))))
      .addActionRowComponents(ui.row(ui.btn('vfy:back', 'Back')));
  }
  return [card, controls];
}

function confirmReset() {
  return [ui.box('warning')
    .addTextDisplayComponents(ui.text('### Reset verification?\n-# Deletes the Unverified role and the saved setup. Waiting members get access back.'))
    .addActionRowComponents(ui.row(ui.btn('vfy:yes', 'Reset', { style: 'danger' }), ui.btn('vfy:no', 'Cancel')))];
}

const canManage = (m) => !!m?.permissions?.has(P.ManageGuild) || !!m?.permissions?.has(P.Administrator);

module.exports = {
  KICK_CHOICES, DEFAULT_TEXT, V2,
  config, bust, change, isReady,
  ok, bad, warn, note,
  challenge, codeModal, check, lockedUntil, failed,
  onJoin, onLeave, pass, forget, expire, log,
  missingPerms, createRole, createChannel, syncChannels, protectChannel, postPanel, reset,
  panel, confirmReset, canManage, kickLabel,
};
