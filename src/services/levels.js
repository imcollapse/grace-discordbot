// grace · levels engine: the XP curve, earning XP, reward roles and the level-up message.

const { PermissionFlagsBits: P } = require('discord.js');
const db = require('../database/levels');
const { applyVars, ctxFromMember } = require('./embedVars');
const { renderEmbed } = require('./embedRender');

/* ---------- the curve ---------- */
// XP to climb from level n to n+1 is 5n² + 50n + 100 (100 for the first, 155 for the second, ...).

const MAX_LEVEL = 500;
const need = (n) => 5 * n * n + 50 * n + 100;
const total = (l) => (l <= 0 ? 0 : (5 * (l - 1) * l * (2 * l - 1)) / 6 + 25 * l * (l - 1) + 100 * l);

function levelFor(xp) {
    let l = 0;
    while (l < MAX_LEVEL && xp >= total(l + 1)) l++;
    return l;
}

/** Where a total sits: level, xp into this level, xp this level takes, 0..1. */
function progress(xp) {
    const level = levelFor(xp);
    const into = xp - total(level), span = need(level);
    return { level, into, span, pct: Math.min(1, into / span) };
}

/* ---------- settings cache ---------- */

const cache = new Map();   // guildId -> { ts, s }
const TTL = 20000;

async function settings(guildId) {
    const hit = cache.get(guildId);
    if (hit && Date.now() - hit.ts < TTL) return hit.s;
    const [cfg, rewards, ign, bst] = await Promise.all([db.guild(guildId), db.roles(guildId), db.ignores(guildId), db.boosts(guildId)]);
    const s = {
        cfg, rewards,
        ignoreRoles: new Set(ign.filter((r) => r.kind === 'role').map((r) => r.target_id)),
        ignoreChannels: new Set(ign.filter((r) => r.kind === 'channel').map((r) => r.target_id)),
        boostRoles: new Map(bst.filter((r) => r.kind === 'role').map((r) => [r.target_id, r.mult])),
        boostChannels: new Map(bst.filter((r) => r.kind === 'channel').map((r) => [r.target_id, r.mult])),
    };
    cache.set(guildId, { ts: Date.now(), s });
    return s;
}
const bust = (guildId) => cache.delete(guildId);

/* ---------- earning ---------- */

const lastEarn = new Map();   // `${guild}:${user}` -> ms
setInterval(() => { const cut = Date.now() - 600000; for (const [k, t] of lastEarn) if (t < cut) lastEarn.delete(k); }, 120000).unref?.();

const rand = (a, b) => a + Math.floor(Math.random() * (Math.max(a, b) - a + 1));

function multiplier(s, member, channel) {
    let roleBoost = 1;
    for (const id of member.roles?.cache?.keys?.() ?? []) roleBoost = Math.max(roleBoost, s.boostRoles.get(id) ?? 1);
    const ids = [channel?.id, channel?.parentId, channel?.parent?.parentId].filter(Boolean);
    let chanBoost = 1;
    for (const id of ids) chanBoost = Math.max(chanBoost, s.boostChannels.get(id) ?? 1);
    return roleBoost * chanBoost;
}

function blocked(s, member, channel) {
    if ([channel?.id, channel?.parentId, channel?.parent?.parentId].some((id) => id && s.ignoreChannels.has(id))) return true;
    for (const id of member.roles?.cache?.keys?.() ?? []) if (s.ignoreRoles.has(id)) return true;
    return false;
}

async function awardMessage(message) {
    const { guild, member, author, channel } = message;
    if (!guild || !member || author.bot) return;
    const s = await settings(guild.id);
    if (!s.cfg.enabled || blocked(s, member, channel)) return;

    const key = `${guild.id}:${author.id}`;
    const now = Date.now();
    if (now - (lastEarn.get(key) ?? 0) < s.cfg.cooldown * 1000) return;
    lastEarn.set(key, now);

    const amount = Math.max(1, Math.round(rand(s.cfg.xp_min, s.cfg.xp_max) * multiplier(s, member, channel)));
    await grant(guild, member, s, amount, { messages: 1 }, channel);
}

/** Give XP, then sort out level, roles and the announcement. */
async function grant(guild, member, s, amount, extra, channel) {
    const row = await db.addXp(guild.id, member.id, amount, extra);
    const xp = Number(row.xp);
    const level = levelFor(xp);
    if (level === Number(row.level)) return { level, up: false };

    await db.setLevelCol(guild.id, member.id, level);
    if (level < Number(row.old_level)) return { level, up: false };     // can only go down through admin commands
    const reward = await syncRoles(member, level, s);
    if (level > Number(row.old_level)) await announce(guild, member, s, { level, oldLevel: Number(row.old_level), xp, row, reward, channel }).catch((e) => console.error('[levels] announce:', e.message));
    return { level, up: true };
}

/* ---------- reward roles ---------- */

/** Give the roles earned at `level`. Returns the role earned exactly at this level, if any. */
async function syncRoles(member, level, s) {
    s ??= await settings(member.guild.id);
    if (!s.rewards.length) return null;
    const me = member.guild.members.me;
    if (!me?.permissions.has(P.ManageRoles)) return null;

    const usable = (id) => { const r = member.guild.roles.cache.get(id); return r && !r.managed && r.id !== member.guild.id && r.position < me.roles.highest.position ? r : null; };
    const earned = s.rewards.filter((r) => r.level <= level);
    const want = s.cfg.stack ? earned : earned.slice(-1);
    const wantIds = new Set(want.map((r) => r.role_id));
    const add = want.map((r) => usable(r.role_id)).filter((r) => r && !member.roles.cache.has(r.id));
    const drop = s.cfg.stack ? [] : s.rewards.filter((r) => !wantIds.has(r.role_id)).map((r) => usable(r.role_id)).filter((r) => r && member.roles.cache.has(r.id));

    try {
        if (add.length) await member.roles.add(add, 'Level reward');
        if (drop.length) await member.roles.remove(drop, 'Level reward (replaced)');
    } catch (e) { console.error('[levels] roles:', e.message); }

    const at = s.rewards.find((r) => r.level === level);
    return at ? member.guild.roles.cache.get(at.role_id) ?? null : null;
}

/* ---------- voice ---------- */

async function voiceSweep(client) {
    for (const guildId of await db.enabledGuildIds().catch(() => [])) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        try {
            const s = await settings(guildId);
            const byChannel = new Map();
            for (const vs of guild.voiceStates.cache.values()) {
                if (!vs.channelId || vs.member?.user.bot) continue;
                if (!byChannel.has(vs.channelId)) byChannel.set(vs.channelId, []);
                byChannel.get(vs.channelId).push(vs);
            }
            for (const [, list] of byChannel) {
                if (list.length < 2) continue;                                   // alone in a channel earns nothing
                for (const vs of list) {
                    if (vs.selfDeaf || vs.serverDeaf || vs.selfMute || vs.serverMute) continue;
                    const member = vs.member;
                    if (!member || blocked(s, member, vs.channel)) continue;
                    const amount = Math.max(1, Math.round(rand(Math.ceil(s.cfg.xp_min / 3), Math.ceil(s.cfg.xp_max / 3)) * multiplier(s, member, vs.channel)));
                    await grant(guild, member, s, amount, { voiceSecs: 60 }, null);
                }
            }
        } catch (e) { console.error(`[levels] voice ${guildId}:`, e.message); }
    }
}

/* ---------- the level-up message ---------- */

/** What the built-in design looks like. The embed editor starts from this, too. */
const DEFAULT_EMBED = {
    color: 0xf0b04a,
    author: { name: 'Level up', icon: '{user.avatar}' },
    description: '### {user.nick} reached level {level}\nYou climbed from level **{level.old}** to **{level}**. {reward.line}',
    thumbnail: '{user.avatar}',
    footer: { text: 'Rank #{rank} · {xp.total} XP · {xp.next} XP to level {level.next}' },
    fields: [], buttons: [], timestamp: false,
};

const VARIABLES = [
    ['{level}', 'The new level'],
    ['{level.old}', 'The level before'],
    ['{level.next}', 'The next level to reach'],
    ['{xp}', 'XP into the current level'],
    ['{xp.next}', 'XP still needed for the next level'],
    ['{xp.total}', 'All XP earned in this server'],
    ['{progress}', 'Percent through the current level'],
    ['{rank}', 'Position on the server leaderboard'],
    ['{messages}', 'Messages counted so far'],
    ['{reward}', 'Mention of the role earned at this level'],
    ['{reward.name}', 'Name of that role'],
    ['{reward.line}', 'A "You unlocked @role" sentence, empty without a reward'],
];

/** The {tags} a level-up knows about. Keys are letters and dots only, like every other variable. */
function levelVars({ level, oldLevel, xp, rank, messages, reward }) {
    const p = progress(xp);
    const f = (n) => Number(n).toLocaleString('en-US');
    return {
        'level': String(level), 'level.old': String(oldLevel), 'level.next': String(level + 1),
        'xp': f(p.into), 'xp.next': f(p.span - p.into), 'xp.total': f(xp),
        'progress': `${Math.round(p.pct * 100)}%`, 'rank': String(rank), 'messages': f(messages),
        'reward': reward ? `<@&${reward.id}>` : '', 'reward.name': reward?.name ?? '',
        'reward.line': reward ? `You unlocked <@&${reward.id}>!` : '',
    };
}

/**
 * Turn the server's design into a message.
 * @returns { payload, problem? }
 */
async function build(guild, cfg, ctx) {
    const text = (cfg.message ?? '').trim();
    if (cfg.style === 'text') {
        const content = applyVars(text || '{user} reached level {level}!', ctx).slice(0, 2000);
        return { payload: { content } };
    }
    if (cfg.style === 'container' && cfg.container) {
        const { compose } = require('./greeter');
        const out = await compose(guild, `${text} {container:${cfg.container}}`.trim(), ctx);
        if (out.payload && out.kind === 'container') return out;
        return { payload: await defaultPayload(ctx), problem: out.problem };
    }
    if (cfg.style === 'embed') {
        const payload = renderEmbed({ id: 'level', data: { ...DEFAULT_EMBED, ...(cfg.embed ?? {}) } }, ctx, { content: text });
        if (payload) return { payload };
    }
    return { payload: await defaultPayload(ctx) };
}

const defaultPayload = async (ctx) => renderEmbed({ id: 'level', data: DEFAULT_EMBED }, ctx);

/** Context for the variables, for a real level-up or for previews. */
async function contextFor(member, channel, info) {
    const ctx = ctxFromMember(member, channel);
    ctx.vars = levelVars(info);
    return ctx;
}

async function announce(guild, member, s, { level, oldLevel, xp, row, reward, channel }) {
    const cfg = s.cfg;
    if (cfg.mode === 'off') return;
    const rank = await db.rankOf(guild.id, xp);
    const where = cfg.mode === 'dm' ? null
        : (cfg.mode === 'channel' && cfg.channel_id ? guild.channels.cache.get(cfg.channel_id) : null) ?? channel
          ?? (cfg.channel_id ? guild.channels.cache.get(cfg.channel_id) : null);
    const ctx = await contextFor(member, where ?? null, { level, oldLevel, xp, rank, messages: Number(row.messages), reward });
    const out = await build(guild, cfg, ctx);
    if (!out.payload) return;
    const body = { ...out.payload, allowedMentions: { users: [member.id], roles: [] } };

    if (cfg.mode === 'dm') { await member.send(body).catch(() => {}); return; }
    if (!where?.isTextBased?.()) return;
    if (!where.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages])) return;
    const sent = await where.send(body).catch(() => null);
    if (sent && cfg.auto_delete > 0) setTimeout(() => sent.delete().catch(() => {}), cfg.auto_delete * 1000).unref?.();
}

module.exports = {
    MAX_LEVEL, need, total, levelFor, progress,
    settings, bust, awardMessage, grant, syncRoles, voiceSweep,
    DEFAULT_EMBED, VARIABLES, levelVars, build, contextFor,
};
