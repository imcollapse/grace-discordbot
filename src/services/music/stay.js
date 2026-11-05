/*
 * grace · music · 24/7 mode + voice channel status
 *
 *   24/7      the bot stays in one voice channel: no leaving when alone, `stop` / `disconnect` keep it there,
 *             it rejoins after a restart, a kick or a move.
 *   status    the voice channel's status line follows the player: Playing or Idle (custom emojis).
 */

const { PermissionFlagsBits } = require('discord.js');
const { Music247 } = require('../../database/schemas');
const { printInfo } = require('../consoleLogger');

const on = new Map();             // guildId -> { voiceChannelId, textChannelId }
const lastStatus = new Map();     // channelId -> text we last set
const rejoining = new Set();

const isOn = (guildId) => on.has(guildId);
const get = (guildId) => on.get(guildId) || null;

async function load() {
    on.clear();
    for (const r of await Music247.findAll()) on.set(r.guildId, { voiceChannelId: r.voiceChannelId, textChannelId: r.textChannelId });
}

async function enable(guildId, voiceChannelId, textChannelId, setBy) {
    await Music247.upsert({ guildId, voiceChannelId, textChannelId, setBy });
    on.set(guildId, { voiceChannelId, textChannelId });
}

async function disable(guildId) {
    await Music247.destroy({ where: { guildId } });
    on.delete(guildId);
}

/** Join (or re-join) the 24/7 channel of a server. Returns the player or null. */
async function join(client, guildId) {
    const cfg = on.get(guildId);
    if (!cfg || !client.poru) return null;
    const existing = client.poru.players.get(guildId);
    if (existing && existing.voiceChannel === cfg.voiceChannelId && existing.isConnected) return existing;

    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(cfg.voiceChannelId);
    if (!channel) return null;
    const perms = channel.permissionsFor(guild.members.me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) return null;

    try {
        if (existing) existing.destroy();
        const player = client.poru.createConnection({ guildId, voiceChannel: cfg.voiceChannelId, textChannel: cfg.textChannelId || cfg.voiceChannelId, deaf: true });
        if (player.autoplayEnabled === undefined) player.autoplayEnabled = false;
        setStatus(client, guildId, 'idle');
        return player;
    } catch (e) {
        console.error(`[247] could not join ${guildId}:`, e.message);
        return null;
    }
}

/** After a restart (and whenever a lavalink node comes back): rejoin every 24/7 channel. */
async function rejoinAll(client) {
    if (!client.poru) return;
    let n = 0;
    for (const guildId of on.keys()) if (await join(client, guildId)) n++;
    if (n) printInfo(`24/7 mode: rejoined ${n} voice channel${n === 1 ? '' : 's'}`);
}

/** The player went away (kick, move, node loss): come back after a moment. */
function scheduleRejoin(client, guildId, delay = 4000) {
    if (!on.has(guildId) || rejoining.has(guildId)) return;
    rejoining.add(guildId);
    setTimeout(async () => { rejoining.delete(guildId); await join(client, guildId); }, delay).unref?.();
}

/* ── voice channel status ──────────────────────────────────────────── */

const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// The animated `music_playing` emoji from media/emojis.json. A missing key just means no emoji in front of the text.
const emojis = require('../../media/emojis.json');
const EMOJI = {
    playing: emojis.music_playing || '',
    idle: '',
};

/** Two states only: playing (also while paused) and idle. */
function statusText(kind, player) {
    if (kind === 'playing') {
        const t = player?.currentTrack?.info || player?._lastPlayedTrack?.info;
        const name = t ? clip(`${t.title}${t.author ? ` · ${t.author}` : ''}`, 80) : '';
        return `**Playing${name ? ` · ${name}**` : ''}`.trim();
    }
    if (kind === 'idle') return `**Idle**`.trim();
    return '';
}

/** kind: playing | idle. Needs "Set Voice Channel Status"; silently does nothing without it. */
async function setStatus(client, guildId, kind, player = null) {
    try {
        player ||= client.poru?.players?.get(guildId);
        const channelId = player?.voiceChannel || on.get(guildId)?.voiceChannelId;
        if (!channelId) return;
        const status = statusText(kind, player || { guildId });
        if (lastStatus.get(channelId) === status) return;
        lastStatus.set(channelId, status);
        await client.rest.put(`/channels/${channelId}/voice-status`, { body: { status } });
    } catch (_) { /* no permission or channel gone: not worth a log line */ }
}

/** Clear the status when the bot leaves a channel for good. */
async function clearStatus(client, channelId) {
    if (!channelId || !lastStatus.get(channelId)) return;
    lastStatus.delete(channelId);
    try { await client.rest.put(`/channels/${channelId}/voice-status`, { body: { status: '' } }); } catch (_) { /* ignore */ }
}

module.exports = { isOn, get, load, enable, disable, join, rejoinAll, scheduleRejoin, setStatus, clearStatus, statusText };
