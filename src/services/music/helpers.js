/* grace · music · helpers (ported from AeroX Music) */

const { PermissionFlagsBits } = require('discord.js');

function formatDuration(ms) {
    if (typeof ms !== 'number' || Number.isNaN(ms) || ms < 0) return '0:00';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

/** "3m 20s" */
function humanDuration(ms) {
    if (typeof ms !== 'number' || Number.isNaN(ms) || ms < 0) return '0s';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

/**
 * Requester, server managers and admins may control the player.
 * `who` is a GuildMember-bearing message / interaction.
 */
function hasControlPermission(who, player) {
    if (!player.currentTrack) return true;
    const member = who.member;
    const userId = who.user?.id || who.author?.id;
    if (member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
        member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    const requesterId = player.currentTrack.info.requester?.id;
    return !requesterId || userId === requesterId;
}

const safeTitle = (t) => String(t || 'Unknown Title').replace(/[\[\]]/g, '');

function trackData(track) {
    const i = track.info;
    return {
        title: String(i.title || 'Unknown').slice(0, 250),
        identifier: String(i.identifier || i.uri || '').slice(0, 250),
        author: String(i.author || 'Unknown').slice(0, 250),
        length: Math.max(0, Math.floor(i.length || 0)),
        uri: String(i.uri || '').slice(0, 250),
        artworkUrl: (i.artworkUrl || i.image || null)?.slice?.(0, 250) ?? null,
    };
}

module.exports = { formatDuration, humanDuration, hasControlPermission, safeTitle, trackData };
