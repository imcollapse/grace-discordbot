// Snapshot — rebuild a server from captured data. Destructive: channels, roles and emojis are replaced.

const { ChannelType, PermissionFlagsBits } = require('discord.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const big = (v) => { try { return BigInt(v); } catch { return 0n; } };

const FALLBACK = { [ChannelType.GuildAnnouncement]: ChannelType.GuildText, [ChannelType.GuildStageVoice]: ChannelType.GuildVoice, [ChannelType.GuildForum]: ChannelType.GuildText, [ChannelType.GuildMedia]: ChannelType.GuildText };
const TEXTLIKE = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia]);
const VOICELIKE = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);

/** Can the bot do this? Returns an error string or null. */
function check(guild) {
    return guild.members.me?.permissions.has(PermissionFlagsBits.Administrator) ? null : 'I need the **Administrator** permission to load a snapshot.';
}

/**
 * @param opts { keepChannelId, progress(stage) }
 * @returns { created: {roles, channels, emojis}, skipped, firstText }
 */
async function restore(guild, data, { keepChannelId = null, progress = async () => {} } = {}) {
    const me = guild.members.me;
    const skipped = { value: 0 };
    const attempt = async (fn) => { try { return await fn(); } catch { skipped.value++; return null; } };
    await Promise.all([guild.roles.fetch(), guild.channels.fetch(), guild.emojis.fetch().catch(() => null)]);

    // 1 · channels (the one the command was run in goes last so the progress message survives)
    await progress('Deleting channels');
    const doomed = [...guild.channels.cache.values()].filter((c) => !c.isThread?.());
    for (const c of doomed.filter((c) => c.id !== keepChannelId)) await attempt(() => c.delete('Snapshot load'));

    // 2 · roles
    await progress('Replacing roles');
    const top = me.roles.highest.position;
    for (const r of [...guild.roles.cache.values()]) {
        if (r.managed || r.id === guild.id || r.position >= top) continue;
        await attempt(() => r.delete('Snapshot load'));
    }
    await attempt(() => guild.roles.everyone.setPermissions(big(data.everyone), 'Snapshot load'));

    const roleMap = new Map([[data.sourceGuildId, guild.id]]);
    const madeRoles = [];
    for (const r of data.roles) {
        const role = await attempt(() => guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: big(r.permissions), reason: 'Snapshot load' }));
        if (role) { roleMap.set(r.id, role.id); madeRoles.push(role); }
    }
    // order them like the original (as far as the bot's own role allows)
    const room = Math.max(1, top - 1);
    await attempt(() => guild.roles.setPositions(madeRoles.map((role, i) => ({ role, position: Math.min(i + 1, room) }))));

    // 3 · channels
    await progress('Creating channels');
    const mapId = (old) => roleMap.get(old) ?? null;
    const overwritesOf = (c) => c.overwrites.map((o) => ({ id: mapId(o.id), allow: big(o.allow), deny: big(o.deny), type: 0 })).filter((o) => o.id);
    const chanMap = new Map();

    const make = async (c, parent) => {
        const base = {
            name: c.name, parent: parent ?? undefined, permissionOverwrites: overwritesOf(c), reason: 'Snapshot load',
            ...(TEXTLIKE.has(c.type) ? { topic: c.topic ?? undefined, nsfw: c.nsfw, rateLimitPerUser: c.rateLimitPerUser || undefined } : {}),
            ...(VOICELIKE.has(c.type) ? { bitrate: c.bitrate ? Math.min(c.bitrate, guild.maximumBitrate || 96000) : undefined, userLimit: c.userLimit || undefined } : {}),
        };
        try { return await guild.channels.create({ ...base, type: c.type }); }
        catch {
            const fb = FALLBACK[c.type];
            if (fb === undefined) { skipped.value++; return null; }
            return attempt(() => guild.channels.create({ ...base, type: fb }));
        }
    };

    const byPos = (a, b) => a.position - b.position;
    const cats = data.channels.filter((c) => c.type === ChannelType.GuildCategory).sort(byPos);
    const rest = data.channels.filter((c) => c.type !== ChannelType.GuildCategory).sort(byPos);
    let channelsMade = 0;
    for (const c of cats) { const n = await make(c, null); if (n) { chanMap.set(c.id, n.id); channelsMade++; } }
    for (const c of rest) { const n = await make(c, c.parentId ? chanMap.get(c.parentId) : null); if (n) { chanMap.set(c.id, n.id); channelsMade++; } }

    // the channel we kept goes now
    if (keepChannelId) await attempt(() => guild.channels.cache.get(keepChannelId)?.delete('Snapshot load'));

    // 4 · settings, icon, banner
    await progress('Applying settings');
    const s = data.settings;
    const ch = (old) => (old ? chanMap.get(old) ?? null : null);
    await attempt(() => guild.edit({
        name: s.name, verificationLevel: s.verificationLevel, defaultMessageNotifications: s.defaultMessageNotifications,
        explicitContentFilter: s.explicitContentFilter, afkTimeout: s.afkTimeout, afkChannel: ch(s.afkChannelId),
        systemChannel: ch(s.systemChannelId), systemChannelFlags: s.systemChannelFlags, premiumProgressBarEnabled: s.premiumProgressBarEnabled,
        reason: 'Snapshot load',
    }));
    if (data.icon) await attempt(() => guild.setIcon(data.icon, 'Snapshot load'));
    if (data.banner) await attempt(() => guild.setBanner(data.banner, 'Snapshot load'));
    if (data.splash) await attempt(() => guild.setSplash(data.splash, 'Snapshot load'));

    // 5 · emojis
    let emojisMade = 0;
    if (data.emojis.length) {
        await progress('Restoring emojis');
        for (const e of [...guild.emojis.cache.values()]) await attempt(() => e.delete('Snapshot load'));
        for (const e of data.emojis) {
            const made = await attempt(() => guild.emojis.create({ attachment: e.data, name: e.name, reason: 'Snapshot load' }));
            if (!made) break;     // emoji slots full or rate limited: stop instead of failing every one
            emojisMade++;
            await sleep(250);
        }
    }

    const firstText = [...guild.channels.cache.values()].filter((c) => c.type === ChannelType.GuildText && c.viewable).sort((a, b) => a.rawPosition - b.rawPosition)[0] || null;
    return { created: { roles: madeRoles.length, channels: channelsMade, emojis: emojisMade }, skipped: skipped.value, firstText };
}

module.exports = { restore, check };
