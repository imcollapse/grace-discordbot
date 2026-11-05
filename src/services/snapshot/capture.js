// Snapshot — read a server into a plain object (roles, channels, settings, icon, banner, emojis).

const { ChannelType } = require('discord.js');

const MAX_ASSET = 8 * 1024 * 1024;
const MAX_EMOJIS = 100;

async function asset(url) {
    if (!url) return null;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_ASSET) return null;
        const type = res.headers.get('content-type') || 'image/png';
        return `data:${type};base64,${buf.toString('base64')}`;
    } catch { return null; }
}

const ext = (hash) => (String(hash || '').startsWith('a_') ? 'gif' : 'png');

async function capture(guild) {
    await Promise.all([guild.roles.fetch(), guild.channels.fetch(), guild.emojis.fetch().catch(() => null)]);

    const roles = [...guild.roles.cache.values()]
        .filter((r) => !r.managed && r.id !== guild.id)
        .sort((a, b) => a.position - b.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString() }));

    const channels = [...guild.channels.cache.values()]
        .filter((c) => !c.isThread?.())
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
        .map((c) => ({
            id: c.id, name: c.name, type: c.type, parentId: c.parentId || null, position: c.rawPosition ?? 0,
            topic: c.topic ?? null, nsfw: !!c.nsfw, rateLimitPerUser: c.rateLimitPerUser ?? 0,
            bitrate: c.bitrate ?? null, userLimit: c.userLimit ?? 0, defaultAutoArchiveDuration: c.defaultAutoArchiveDuration ?? null,
            overwrites: [...(c.permissionOverwrites?.cache.values() ?? [])]
                .filter((o) => o.type === 0)   // role overwrites only
                .map((o) => ({ id: o.id, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })),
        }));

    const [icon, banner, splash] = await Promise.all([
        asset(guild.iconURL({ extension: ext(guild.icon), size: 1024 })),
        asset(guild.bannerURL({ extension: ext(guild.banner), size: 1024 })),
        asset(guild.splashURL({ extension: 'png', size: 1024 })),
    ]);

    const emojis = [];
    for (const e of [...guild.emojis.cache.values()].slice(0, MAX_EMOJIS)) {
        const data = await asset(e.imageURL({ extension: e.animated ? 'gif' : 'png', size: 128 }));
        if (data) emojis.push({ name: e.name, data });
    }

    return {
        v: 1,
        sourceGuildId: guild.id,
        everyone: guild.roles.everyone.permissions.bitfield.toString(),
        roles, channels, emojis,
        settings: {
            name: guild.name, description: guild.description ?? null,
            verificationLevel: guild.verificationLevel, defaultMessageNotifications: guild.defaultMessageNotifications,
            explicitContentFilter: guild.explicitContentFilter, afkTimeout: guild.afkTimeout,
            afkChannelId: guild.afkChannelId, systemChannelId: guild.systemChannelId,
            systemChannelFlags: guild.systemChannelFlags?.bitfield ?? 0, rulesChannelId: guild.rulesChannelId,
            publicUpdatesChannelId: guild.publicUpdatesChannelId, preferredLocale: guild.preferredLocale,
            premiumProgressBarEnabled: !!guild.premiumProgressBarEnabled,
        },
        icon, banner, splash,
    };
}

const countsOf = (d) => ({
    roles: d.roles.length,
    categories: d.channels.filter((c) => c.type === ChannelType.GuildCategory).length,
    channels: d.channels.filter((c) => c.type !== ChannelType.GuildCategory).length,
    emojis: d.emojis.length,
});

module.exports = { capture, countsOf };
