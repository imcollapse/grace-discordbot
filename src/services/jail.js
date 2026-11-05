// grace — jail. A "Jailed" role that can only see one channel; members keep their old roles safely
// stored and get them back when released (by hand or when the timer ends).
//
//   setup / sync / reset      per-server setup
//   jail / release            the actions
//   list                      who is jailed
//   expire                    release everyone whose time is up (called by the event timer)
//   view helpers              containers using the bot's own tick / cross emojis

const { PermissionFlagsBits: P, ChannelType } = require('discord.js');
const ui = require('./ui');
const emojis = require('../media/emojis.json');
const { JailConfig, JailMember } = require('../database/schemas');

const TICK = emojis.success, CROSS = emojis.error, WARN = emojis.warning;
const ts = (d, s = 'R') => `<t:${Math.floor(new Date(d).getTime() / 1000)}:${s}>`;
const COLOR = { ok: ui.COLOR.success, bad: ui.COLOR.error, warn: ui.COLOR.warning, base: ui.COLOR.base };

/* ── containers ────────────────────────────────────────────────────── */

const ok = (text, sub) => note('ok', TICK, text, sub);
const fail = (text, sub) => note('bad', CROSS, text, sub);
const warn = (text, sub) => note('warn', WARN, text, sub);
function note(kind, icon, text, sub) {
    const b = ui.box('base').setAccentColor(COLOR[kind]).addTextDisplayComponents(ui.text(`${icon}  ${text}`));
    if (sub) b.addTextDisplayComponents(ui.text(ui.sub(sub)));
    return b;
}

/** Big result card for jail / release. */
function resultCard({ title, user, moderator, reason, jailedAt, expiresAt, extra, color = COLOR.ok, icon = TICK }) {
    const avatar = user.displayAvatarURL?.({ extension: 'png', size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const lines = [
        `**Member**  <@${user.id}>  ·  \`${user.id}\``,
        `**By**  <@${moderator.id}>`,
        reason ? `**Reason**  ${reason}` : null,
        jailedAt ? `**Jailed**  ${ts(jailedAt, 'f')}` : null,
        expiresAt !== undefined ? `**Release**  ${expiresAt ? `${ts(expiresAt, 'f')}  (${ts(expiresAt)})` : 'when a moderator lets them out'}` : null,
        extra,
    ].filter(Boolean).join('\n');
    return ui.box('base').setAccentColor(color)
        .addSectionComponents(ui.section(`## ${icon}  ${title}\n-# ${user.username ?? user.id}`, avatar))
        .addSeparatorComponents(ui.sep(true, true))
        .addTextDisplayComponents(ui.text(lines));
}

/* ── storage ───────────────────────────────────────────────────────── */

const config = (guildId) => JailConfig.findByPk(guildId);
const jailedRow = (guildId, userId) => JailMember.findOne({ where: { guildId, userId } });

/* ── setup ─────────────────────────────────────────────────────────── */

const DENY = { ViewChannel: false, SendMessages: false, AddReactions: false, Connect: false, Speak: false, SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false };

/** Hide every channel from the jailed role except the jail channel. Returns { done, failed }. */
async function syncChannels(guild, role, jailChannelId) {
    let done = 0, failed = 0;
    const list = [...guild.channels.cache.values()].filter((c) => c.permissionOverwrites && !c.isThread?.() && c.id !== jailChannelId);
    for (const ch of list) {
        try { await ch.permissionOverwrites.edit(role, DENY, { reason: 'Jail setup' }); done++; } catch { failed++; }
    }
    return { done, failed };
}

async function createJailChannel(guild, role) {
    const me = guild.members.me;
    return guild.channels.create({
        name: 'jail', type: ChannelType.GuildText, topic: 'Jailed members end up here until a moderator lets them out.',
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
            { id: role.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory], deny: [P.AttachFiles, P.EmbedLinks] },
            { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.EmbedLinks] },
        ],
        reason: 'Jail setup',
    });
}

/** Missing bot permissions for setup, as a readable list. */
function missingForSetup(guild) {
    const need = [['ManageRoles', 'Manage Roles'], ['ManageChannels', 'Manage Channels']];
    return need.filter(([k]) => !guild.members.me.permissions.has(P[k])).map(([, n]) => n);
}

async function setup(guild) {
    const me = guild.members.me;
    const role = await guild.roles.create({ name: 'Jailed', color: 0x4a4f57, permissions: [], mentionable: false, reason: 'Jail setup' });
    await role.setPosition(Math.max(1, me.roles.highest.position - 1)).catch(() => {});
    const channel = await createJailChannel(guild, role);
    const sync = await syncChannels(guild, role, channel.id);
    await JailConfig.upsert({ guildId: guild.id, roleId: role.id, channelId: channel.id });
    return { role, channel, ...sync };
}

async function resync(guild) {
    const cfg = await config(guild.id);
    const role = cfg && guild.roles.cache.get(cfg.roleId);
    if (!role) return null;
    return { role, ...(await syncChannels(guild, role, cfg.channelId)) };
}

/** Let everyone out, delete the role and channel, forget the setup. */
async function reset(guild) {
    const cfg = await config(guild.id);
    if (!cfg) return { released: 0 };
    const rows = await JailMember.findAll({ where: { guildId: guild.id } });
    let released = 0;
    for (const r of rows) { const res = await release(guild, r.userId, { by: guild.client.user.id, quiet: true }); if (res.ok) released++; }
    await guild.channels.cache.get(cfg.channelId)?.delete('Jail reset').catch(() => {});
    await guild.roles.cache.get(cfg.roleId)?.delete('Jail reset').catch(() => {});
    await JailConfig.destroy({ where: { guildId: guild.id } });
    await JailMember.destroy({ where: { guildId: guild.id } });
    return { released };
}

/* ── jail / release ────────────────────────────────────────────────── */

/** Can this role be taken off the member by the bot? */
const editable = (guild, role) => !role.managed && role.id !== guild.roles.everyone.id && role.position < guild.members.me.roles.highest.position;

/**
 * @returns { ok, row?, reason? }  reason: not_setup | no_role | already | failed
 */
async function jail(guild, member, { moderatorId, reason, ms }) {
    const cfg = await config(guild.id);
    if (!cfg) return { ok: false, reason: 'not_setup' };
    const role = guild.roles.cache.get(cfg.roleId);
    if (!role) return { ok: false, reason: 'no_role' };
    if (await jailedRow(guild.id, member.id)) return { ok: false, reason: 'already' };

    const taken = member.roles.cache.filter((r) => r.id !== role.id && editable(guild, r)).map((r) => r.id);
    const kept = member.roles.cache.filter((r) => r.id !== guild.roles.everyone.id && r.id !== role.id && !taken.includes(r.id)).map((r) => r.id);
    try { await member.roles.set([...kept, role.id], `Jailed by ${moderatorId}${reason ? `: ${reason}` : ''}`); }
    catch (e) { console.error('[jail] could not set roles:', e.message); return { ok: false, reason: 'failed' }; }

    if (member.voice?.channel) member.voice.disconnect('Jailed').catch(() => {});
    const row = await JailMember.create({
        guildId: guild.id, userId: member.id, moderatorId, reason: reason || null, roles: taken,
        jailedAt: new Date(), expiresAt: ms ? new Date(Date.now() + ms) : null,
    });

    // tell them where they are
    const channel = cfg.channelId && guild.channels.cache.get(cfg.channelId);
    channel?.send({
        components: [ui.box('base').setAccentColor(COLOR.warn)
            .addTextDisplayComponents(ui.text(`### ${WARN}  You have been jailed\n<@${member.id}>, you can't see the rest of the server right now.`))
            .addSeparatorComponents(ui.sep(false))
            .addTextDisplayComponents(ui.text(`**Reason**  ${reason || 'No reason given'}\n**Release**  ${row.expiresAt ? ts(row.expiresAt) : 'when a moderator lets you out'}`))],
        flags: require('discord.js').MessageFlags.IsComponentsV2, allowedMentions: { users: [member.id] },
    }).catch(() => {});
    return { ok: true, row };
}

/** @returns { ok, row?, reason? }  reason: not_jailed */
async function release(guild, userId, { by, quiet = false } = {}) {
    const row = await jailedRow(guild.id, userId);
    if (!row) return { ok: false, reason: 'not_jailed' };
    const cfg = await config(guild.id);
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (member) {
        const back = (row.roles || []).filter((id) => guild.roles.cache.has(id) && editable(guild, guild.roles.cache.get(id)));
        try {
            if (cfg && member.roles.cache.has(cfg.roleId)) await member.roles.remove(cfg.roleId, `Released by ${by}`);
            if (back.length) await member.roles.add(back, 'Jail: roles restored');
        } catch (e) { console.error('[jail] could not restore roles:', e.message); }
    }
    await row.destroy();
    return { ok: true, row, member };
}

/** Put the jail role back on someone who left and returned while jailed. */
async function reapply(member) {
    const row = await jailedRow(member.guild.id, member.id);
    if (!row) return;
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) { await release(member.guild, member.id, { by: member.client.user.id }); return; }
    const cfg = await config(member.guild.id);
    if (cfg) await member.roles.add(cfg.roleId, 'Still jailed').catch(() => {});
}

/** New channels get the jailed role's restrictions too. */
async function protectChannel(channel) {
    const cfg = channel.guild && await config(channel.guild.id);
    const role = cfg && channel.guild.roles.cache.get(cfg.roleId);
    if (!role || channel.id === cfg.channelId || !channel.permissionOverwrites) return;
    await channel.permissionOverwrites.edit(role, DENY, { reason: 'Jail: new channel' }).catch(() => {});
}

/** Release everyone whose time is up. */
async function expire(client) {
    const { Op } = require('sequelize');
    const rows = await JailMember.findAll({ where: { expiresAt: { [Op.lt]: new Date() } } });
    for (const r of rows) {
        const guild = client.guilds.cache.get(r.guildId);
        if (!guild) continue;
        const res = await release(guild, r.userId, { by: client.user.id });
        if (!res.ok) continue;
        const cfg = await config(guild.id);
        guild.channels.cache.get(cfg?.channelId)?.send({
            components: [ok(`<@${r.userId}> served their time and was released.`)],
            flags: require('discord.js').MessageFlags.IsComponentsV2, allowedMentions: { parse: [] },
        }).catch(() => {});
    }
}

const listJailed = (guildId) => JailMember.findAll({ where: { guildId }, order: [['jailedAt', 'DESC']] });

module.exports = {
    TICK, CROSS, WARN, COLOR, ts, ok, fail, warn, resultCard,
    config, jailedRow, missingForSetup, setup, resync, reset, jail, release, reapply, protectChannel, expire, listJailed, editable,
};
