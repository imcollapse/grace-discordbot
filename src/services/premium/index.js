// Premium — three separate plans.
//   Server premium    everything extra for one server, branding included. Its owner also gets the user perks.
//   User premium      perks that follow a person: family size, economy bonus, captcha skip, snapshot slots.
//   Branding premium  only the per-server bot profile (avatar, banner, bio) for one server.
//
//   perks          what premium unlocks (numbers live here, change them in one place)
//   guildStatus    { active, source, expiresAt, ... } for a server
//   isGuildPremium / isUserPremium / slots
//   grant / revoke / startTrial
//   dueNotices     lapsed rows whose owner has not been told yet

const { Op } = require('sequelize');

const DAY = 86400000;
const TRIAL_DAYS = 3;

const perks = {
    embeds:          { free: 25, premium: 60 },   // saved embeds per server
    containers:      { free: 25, premium: 60 },   // saved containers per server
    welcomeChannels: { free: 0,  premium: 10 },   // extra welcome channels
    children:        { free: 5,  premium: 15 },   // family
    economy:         { free: 1,  premium: 1.5 },  // multiplier on economy rewards (applied by the economy when it ships)
};

const KINDS = {
    server:   { label: 'Server Premium',   emoji: 'premium_server' },
    user:     { label: 'User Premium',     emoji: 'premium_user' },
    branding: { label: 'Branding Premium', emoji: 'premium_branding' },
};

let _store = null;
const store = () => (_store ||= {
    get: (guildId) => require('../../database/schemas').PremiumGuild.findByPk(guildId).then((r) => r && r.get({ plain: true })),
    upsert: (v) => require('../../database/schemas').PremiumGuild.upsert(v),
    destroy: (guildId) => require('../../database/schemas').PremiumGuild.destroy({ where: { guildId } }),
    ownedBy: (ownerId) => require('../../database/schemas').PremiumGuild.findAll({ where: { ownerId } }).then((rows) => rows.map((r) => r.get({ plain: true }))),
    trialUsedBy: async (ownerId) => !!(await require('../../database/schemas').PremiumGuild.findOne({ where: { ownerId, trialUsed: true } })),
    due: (now) => require('../../database/schemas').PremiumGuild.findAll({ where: { endNotified: false, expiresAt: { [Op.lt]: now } } }).then((rows) => rows.map((r) => r.get({ plain: true }))),
    markNotified: (guildId) => require('../../database/schemas').PremiumGuild.update({ endNotified: true }, { where: { guildId } }),
    all: () => require('../../database/schemas').PremiumGuild.findAll({ order: [['updatedAt', 'DESC']] }).then((rows) => rows.map((r) => r.get({ plain: true }))),
});

const pass = {
    get: (kind, targetId) => require('../../database/schemas').PremiumPass.findOne({ where: { kind, targetId } }).then((r) => r && r.get({ plain: true })),
    upsert: async (v) => {
        const M = require('../../database/schemas').PremiumPass;
        const cur = await M.findOne({ where: { kind: v.kind, targetId: v.targetId } });
        if (cur) await cur.update(v); else await M.create(v);
    },
    all: (kind) => require('../../database/schemas').PremiumPass.findAll({ where: kind ? { kind } : {}, order: [['updatedAt', 'DESC']] }).then((rows) => rows.map((r) => r.get({ plain: true }))),
};

const live = (row, now = Date.now()) => !!row && (!row.expiresAt || new Date(row.expiresAt).getTime() > now);

/* ── cache ─────────────────────────────────────────────────────────── */

const TTL = 30000;
const guildCache = new Map();
const userCache = new Map();
const passCache = new Map();
const bust = (guildId) => { if (guildId) guildCache.delete(guildId); userCache.clear(); passCache.clear(); try { require('../family/engine').clearPremiumCache?.(); } catch { /* optional */ } };

async function guildStatus(guildId) {
    const hit = guildCache.get(guildId);
    if (hit && Date.now() - hit.at < TTL) return hit.val;
    const row = await store().get(guildId);
    const val = {
        row, active: live(row), expired: !!row && !live(row),
        source: row?.source ?? null, trialUsed: !!row?.trialUsed,
        permanent: !!row && !row.expiresAt,
        startedAt: row?.startedAt ?? null, expiresAt: row?.expiresAt ?? null, ownerId: row?.ownerId ?? null,
    };
    guildCache.set(guildId, { val, at: Date.now() });
    return val;
}

const isGuildPremium = async (guildId) => !!guildId && (await guildStatus(guildId)).active;

/** Per-server limits. */
async function slots(guildId) {
    const on = await isGuildPremium(guildId);
    const pick = (k) => perks[k][on ? 'premium' : 'free'];
    return { premium: on, embeds: pick('embeds'), containers: pick('containers'), welcomeChannels: pick('welcomeChannels') };
}

async function passStatus(kind, targetId) {
    const key = `${kind}:${targetId}`;
    const hit = passCache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.val;
    const row = await pass.get(kind, targetId).catch(() => null);
    const val = { row, active: live(row), expired: !!row && !live(row), permanent: !!row && !row.expiresAt, expiresAt: row?.expiresAt ?? null, startedAt: row?.startedAt ?? null };
    passCache.set(key, { val, at: Date.now() });
    return val;
}

/** Branding (per-server bot profile) comes with Server Premium or with its own Branding Premium. */
async function hasBranding(guildId) {
    if (!guildId) return false;
    if (await isGuildPremium(guildId)) return true;
    return (await passStatus('branding', guildId)).active;
}

/** Where a person's premium comes from: their own User Premium, a premium server they own, or the no-prefix perk. */
async function userSources(userId) {
    const out = { pass: (await passStatus('user', userId)).active, server: false, noprefix: false };
    try { out.noprefix = !!(await require('../../database/schemas').NoPrefix.isNoPrefixUser(userId)); } catch { /* none */ }
    try { out.server = (await store().ownedBy(userId)).some((r) => live(r)); } catch { /* none */ }
    return out;
}

/** A user is premium with User Premium, while they own a premium server, or with the no-prefix perk. */
async function isUserPremium(userId) {
    const hit = userCache.get(userId);
    if (hit && Date.now() - hit.at < TTL) return hit.val;
    const src = await userSources(userId);
    const val = src.pass || src.server || src.noprefix;
    userCache.set(userId, { val, at: Date.now() });
    return val;
}

/** 1.5 for premium users, 1 otherwise. The economy multiplies its rewards by this. */
async function economyBoost(userId) {
    return (await isUserPremium(userId)) ? perks.economy.premium : perks.economy.free;
}

/* ── changes ───────────────────────────────────────────────────────── */

/** Parse "7d", "2w", "1m", "1y", "permanent" → ms (null = permanent), or undefined when invalid. */
function parseLength(input) {
    const s = String(input ?? '').trim().toLowerCase();
    if (['perm', 'permanent', 'forever', 'lifetime'].includes(s)) return null;
    const m = s.match(/^(\d{1,4})\s*(d|w|m|y)$/);
    if (!m) return undefined;
    const n = Number(m[1]); if (!n) return undefined;
    return n * { d: DAY, w: 7 * DAY, m: 30 * DAY, y: 365 * DAY }[m[2]];
}

function lengthLabel(ms) {
    if (ms == null) return 'permanent';
    const d = Math.round(ms / DAY);
    if (d % 365 === 0) return `${d / 365} year${d === 365 ? '' : 's'}`;
    if (d % 30 === 0 && d >= 30) return `${d / 30} month${d === 30 ? '' : 's'}`;
    if (d % 7 === 0 && d >= 14) return `${d / 7} weeks`;
    return `${d} day${d === 1 ? '' : 's'}`;
}

/** Give a server premium (extends from the current end when it is still running). */
async function grant(guild, { ms, by }) {
    const cur = await store().get(guild.id);
    const base = live(cur) && cur.expiresAt ? new Date(cur.expiresAt).getTime() : Date.now();
    const expiresAt = ms == null ? null : new Date(base + ms);
    await store().upsert({
        guildId: guild.id, guildName: guild.name, ownerId: guild.ownerId,
        source: 'grant', trialUsed: !!cur?.trialUsed, grantedBy: by,
        startedAt: live(cur) ? cur.startedAt : new Date(), expiresAt, endNotified: false,
    });
    bust(guild.id);
    return guildStatus(guild.id);
}

async function revoke(guildId) {
    const cur = await store().get(guildId);
    if (!live(cur)) return false;
    // keep the row (so the trial stays used) but end it now and don't send a "your premium ended" notice
    await store().upsert({ ...cur, expiresAt: new Date(), endNotified: true });
    bust(guildId);
    return true;
}

/**
 * Start the free trial. Only the server owner, once per server and once per owner.
 * @returns { ok, reason?, status? }  reason: not_owner | active | used | owner_used
 */
async function startTrial(guild, userId) {
    if (guild.ownerId !== userId) return { ok: false, reason: 'not_owner' };
    const cur = await store().get(guild.id);
    if (live(cur)) return { ok: false, reason: 'active', status: await guildStatus(guild.id) };
    if (cur?.trialUsed) return { ok: false, reason: 'used' };
    if (await store().trialUsedBy(userId)) return { ok: false, reason: 'owner_used' };
    await store().upsert({
        guildId: guild.id, guildName: guild.name, ownerId: userId, source: 'trial', trialUsed: true, grantedBy: userId,
        startedAt: new Date(), expiresAt: new Date(Date.now() + TRIAL_DAYS * DAY), endNotified: false,
    });
    bust(guild.id);
    return { ok: true, status: await guildStatus(guild.id) };
}

/** Give a user (kind 'user') or a server (kind 'branding') a pass. Extends from the current end when still running. */
async function grantPass(kind, target, { ms, by }) {
    const id = String(target.id);
    const cur = await pass.get(kind, id);
    const base = live(cur) && cur.expiresAt ? new Date(cur.expiresAt).getTime() : Date.now();
    await pass.upsert({
        kind, targetId: id, targetName: target.name ?? null, grantedBy: by,
        startedAt: live(cur) ? cur.startedAt : new Date(), expiresAt: ms == null ? null : new Date(base + ms),
    });
    bust(kind === 'branding' ? id : null);
    return passStatus(kind, id);
}

async function revokePass(kind, targetId) {
    const cur = await pass.get(kind, String(targetId));
    if (!live(cur)) return false;
    await pass.upsert({ ...cur, expiresAt: new Date() });
    bust(kind === 'branding' ? String(targetId) : null);
    return true;
}

const listPasses = (kind) => pass.all(kind);

const dueNotices = () => store().due(new Date());
const markNotified = (guildId) => store().markNotified(guildId);
const listAll = () => store().all();

module.exports = {
    DAY, TRIAL_DAYS, perks,
    KINDS, guildStatus, isGuildPremium, isUserPremium, hasBranding, userSources, passStatus, economyBoost, slots,
    grantPass, revokePass, listPasses, live,
    parseLength, lengthLabel, grant, revoke, startTrial,
    dueNotices, markNotified, listAll, bust,
    _test: { setStore(s) { _store = s; guildCache.clear(); userCache.clear(); } },
};
