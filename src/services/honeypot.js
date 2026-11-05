// grace — honeypot. A channel nobody legitimate types in: compromised accounts and selfbots that post
// there are punished on the spot. The warning message carries a live "Caught" counter.

const { PermissionFlagsBits: P, MessageFlags } = require('discord.js');
const ui = require('./ui');
const emojis = require('../media/emojis.json');
const { HoneypotConfig } = require('../database/schemas');

const V2 = MessageFlags.IsComponentsV2;
const TICK = emojis.success, CROSS = emojis.error, WARN = emojis.warning;
const ACTIONS = { ban: 'banned', softban: 'softbanned', kick: 'kicked', timeout: 'timed out' };
const TIMEOUT_MS = 24 * 60 * 60 * 1000;
const SWEEP_SECONDS = 60 * 60;          // messages from the last hour are wiped on ban / softban

const note = (kind, icon, text) => ui.box('base').setAccentColor({ ok: ui.COLOR.success, bad: ui.COLOR.error, warn: ui.COLOR.warning }[kind]).addTextDisplayComponents(ui.text(`${icon}  ${text}`));
const ok = (t) => note('ok', TICK, t), fail = (t) => note('bad', CROSS, t), warn = (t) => note('warn', WARN, t);

/* ── config (cached: this runs on every message) ───────────────────── */

const cache = new Map();   // guildId -> { cfg | null, at }
const TTL = 60000;

async function config(guildId) {
    const hit = cache.get(guildId);
    if (hit && Date.now() - hit.at < TTL) return hit.cfg;
    const row = await HoneypotConfig.findByPk(guildId);
    const cfg = row ? row.get({ plain: true }) : null;
    cache.set(guildId, { cfg, at: Date.now() });
    return cfg;
}
const bust = (guildId) => cache.delete(guildId);

async function save(guildId, patch) {
    const row = await HoneypotConfig.findByPk(guildId);
    if (row) await row.update(patch); else await HoneypotConfig.create({ guildId, ...patch });
    bust(guildId);
}
async function clear(guildId) { await HoneypotConfig.destroy({ where: { guildId } }); bust(guildId); }

/* ── the warning message ───────────────────────────────────────────── */

const VERB = { ban: 'BANNED', softban: 'SOFTBANNED', kick: 'KICKED', timeout: 'TIMED OUT' };

function warning(action, caught) {
    return ui.box('base').setAccentColor(ui.COLOR.warning)
        .addTextDisplayComponents(ui.text([
            `### ${WARN}  Don't send messages to this channel.`,
            'This channel is a **honeypot** for compromised accounts and selfbots.',
            'Legit members have no reason to type here.',
            `Any message is treated as a hijacked account, and the sender is **${VERB[action] || 'BANNED'}** immediately, automatically, and without warning.`,
        ].join('\n')))
        .addActionRowComponents(ui.row(ui.btn('honeypot_caught', `Caught: ${caught}`, { disabled: true })));
}

/** Post (or re-post) the warning in the channel and pin it. Returns the message id. */
async function postWarning(channel, cfg) {
    const msg = await channel.send({ components: [warning(cfg.action, cfg.caught || 0)], flags: V2, allowedMentions: { parse: [] } });
    await msg.pin().catch(() => {});
    return msg.id;
}

async function refreshWarning(guild, cfg) {
    const channel = guild.channels.cache.get(cfg.channelId);
    if (!channel || !cfg.messageId) return;
    const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
    await msg?.edit({ components: [warning(cfg.action, cfg.caught || 0)], flags: V2 }).catch(() => {});
}

/* ── setup ─────────────────────────────────────────────────────────── */

/** Missing bot permissions for the chosen action, as readable names. */
function missing(guild, action) {
    const need = { ban: [P.BanMembers, 'Ban Members'], softban: [P.BanMembers, 'Ban Members'], kick: [P.KickMembers, 'Kick Members'], timeout: [P.ModerateMembers, 'Moderate Members'] }[action];
    const list = [[P.ManageMessages, 'Manage Messages'], need];
    return list.filter(([bit]) => !guild.members.me.permissions.has(bit)).map(([, name]) => name);
}

async function arm(guild, channel, action = 'ban', logId = null) {
    const cfg = { action, caught: 0, logId };
    cfg.messageId = await postWarning(channel, cfg);
    await save(guild.id, { channelId: channel.id, messageId: cfg.messageId, action, caught: 0, logId });
    return cfg;
}

async function disarm(guild) {
    const cfg = await config(guild.id);
    if (!cfg) return false;
    const channel = guild.channels.cache.get(cfg.channelId);
    if (channel && cfg.messageId) await channel.messages.fetch(cfg.messageId).then((m) => m.delete()).catch(() => {});
    await clear(guild.id);
    return true;
}

/* ── catching ──────────────────────────────────────────────────────── */

/** Who is never punished: the owner, administrators, and members the bot can't act on. */
function exempt(message, member, action) {
    if (member.id === message.guild.ownerId) return 'owner';
    if (member.permissions.has(P.Administrator)) return 'administrator';
    const can = action === 'kick' ? member.kickable : action === 'timeout' ? member.moderatable : member.bannable;
    return can ? null : 'unpunishable';
}

async function handle(message) {
    if (!message.guild || message.author.bot || message.webhookId) return;
    const cfg = await config(message.guild.id);
    if (!cfg || message.channelId !== cfg.channelId) return;

    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    const why = exempt(message, member, cfg.action);
    if (why) { if (why === 'unpunishable') message.delete().catch(() => {}); return; }

    const reason = 'Honeypot: posted in the trap channel';
    let done = false;
    try {
        if (cfg.action === 'ban') { await message.guild.members.ban(member.id, { reason, deleteMessageSeconds: SWEEP_SECONDS }); done = true; }
        else if (cfg.action === 'softban') {
            await message.guild.members.ban(member.id, { reason, deleteMessageSeconds: SWEEP_SECONDS });
            await message.guild.members.unban(member.id, 'Honeypot softban'); done = true;
        } else if (cfg.action === 'kick') { await member.kick(reason); done = true; }
        else { await member.timeout(TIMEOUT_MS, reason); done = true; }
    } catch (err) { console.error('[honeypot] could not punish:', err.message); }

    if (cfg.action === 'kick' || cfg.action === 'timeout') await message.delete().catch(() => {});
    if (!done) return;

    // the counter on the pinned warning
    await HoneypotConfig.increment('caught', { where: { guildId: message.guild.id } }).catch(() => {});
    bust(message.guild.id);
    const fresh = await config(message.guild.id);
    if (fresh) refreshWarning(message.guild, fresh);

    // optional log channel
    const log = cfg.logId && message.guild.channels.cache.get(cfg.logId);
    log?.send({
        components: [ui.box('base').setAccentColor(ui.COLOR.error)
            .addTextDisplayComponents(ui.text(`### ${TICK}  Honeypot caught someone`))
            .addSeparatorComponents(ui.sep(false))
            .addTextDisplayComponents(ui.text(`**User**  <@${member.id}>  ·  \`${member.id}\`\n**Action**  ${ACTIONS[cfg.action]}\n**Channel**  <#${cfg.channelId}>${message.content ? `\n**Message**  ${message.content.replace(/`/g, "'").slice(0, 300)}` : ''}`))],
        flags: V2, allowedMentions: { parse: [] },
    }).catch(() => {});
}

module.exports = { V2, TICK, CROSS, WARN, ACTIONS, ok, fail, warn, config, save, bust, arm, disarm, missing, refreshWarning, handle, warning };
