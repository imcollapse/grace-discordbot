// Family — rules + persistence. Every function returns { ok: true, ... } or { ok: false, reason, ... }.
// Storage goes through `store` so tests can swap in an in-memory version.

const R = require('./relations');

const LIMIT = { base: 5, premium: 15 };
const SNAPSHOT_CAP = 80;

/* ── storage ──────────────────────────────────────────────────────────── */

const sequelizeStore = () => {
    const { Op } = require('sequelize');
    const M = require('../../database/schemas');
    const ms = (d) => (d ? new Date(d).getTime() : Date.now());
    const mar = (r) => (r ? { a: r.userA, b: r.userB, at: ms(r.marriedAt) } : null);
    const child = (r) => (r ? { childId: r.childId, parentId: r.parentId, coParentId: r.coParentId || null, at: ms(r.adoptedAt) } : null);
    return {
        async getMarriage(u) { return mar(await M.FamilyMarriage.findOne({ where: { [Op.or]: [{ userA: u }, { userB: u }] } })); },
        async createMarriage(a, b) { await M.FamilyMarriage.create({ userA: a, userB: b, marriedAt: new Date() }); },
        async deleteMarriage(u) { await M.FamilyMarriage.destroy({ where: { [Op.or]: [{ userA: u }, { userB: u }] } }); },
        async getChildRow(c) { return child(await M.FamilyChild.findByPk(c)); },
        async getChildrenOf(p) { return (await M.FamilyChild.findAll({ where: { [Op.or]: [{ parentId: p }, { coParentId: p }] } })).map(child); },
        async createChild({ childId, parentId, coParentId }) { await M.FamilyChild.create({ childId, parentId, coParentId: coParentId || null, adoptedAt: new Date() }); },
        async updateChild(c, patch) { await M.FamilyChild.update(patch, { where: { childId: c } }); },
        async deleteChild(c) { await M.FamilyChild.destroy({ where: { childId: c } }); },
        async getSettings(u) { const r = await M.FamilySettings.findByPk(u); return { proposals: r ? r.proposals : true, adoptions: r ? r.adoptions : true }; },
        async setSettings(u, patch) { const [r] = await M.FamilySettings.findOrCreate({ where: { userId: u }, defaults: { userId: u } }); Object.assign(r, patch); await r.save(); },
    };
};

let _store = null;
let _premium = null;
const store = () => (_store ||= sequelizeStore());

const premiumCache = new Map();
async function isPremium(u) {
    if (_premium) return _premium(u);
    const hit = premiumCache.get(u);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.v;
    let v = false;
    try { v = !!(await require('../premium').isUserPremium(u)); } catch { v = false; }
    premiumCache.set(u, { v, at: Date.now() });
    return v;
}
const limitFor = async (u) => ((await isPremium(u)) ? LIMIT.premium : LIMIT.base);

/* ── snapshot ─────────────────────────────────────────────────────────── */

/** The connected family around `uid` (marriage / parent / child links), capped for safety. */
async function snapshot(uid, cap = SNAPSHOT_CAP) {
    const S = { people: new Set(), spouse: new Map(), parents: new Map(), children: new Map(), marriedAt: new Map(), adoptedAt: new Map(), truncated: false };
    const queue = [uid];
    while (queue.length) {
        const x = queue.shift();
        if (S.people.has(x)) continue;
        if (S.people.size >= cap) { S.truncated = true; break; }
        S.people.add(x);

        const m = await store().getMarriage(x);
        if (m) {
            const other = m.a === x ? m.b : m.a;
            S.spouse.set(x, other); S.spouse.set(other, x);
            S.marriedAt.set(x, m.at); S.marriedAt.set(other, m.at);
            queue.push(other);
        }
        const row = await store().getChildRow(x);
        if (row) {
            const ps = [row.parentId, row.coParentId].filter(Boolean);
            S.parents.set(x, ps); S.adoptedAt.set(x, row.at);
            queue.push(...ps);
        }
        const rows = await store().getChildrenOf(x);
        if (rows.length) {
            S.children.set(x, rows.map((r) => r.childId));
            for (const r of rows) { S.parents.set(r.childId, [r.parentId, r.coParentId].filter(Boolean)); S.adoptedAt.set(r.childId, r.at); queue.push(r.childId); }
        }
    }
    return S;
}

/* ── checks ───────────────────────────────────────────────────────────── */

async function checkMarry(a, b) {
    if (a === b) return { ok: false, reason: 'self' };
    const [ma, mb, sb] = await Promise.all([store().getMarriage(a), store().getMarriage(b), store().getSettings(b)]);
    if (ma) return { ok: false, reason: 'you_married', partner: ma.a === a ? ma.b : ma.a };
    if (mb) return { ok: false, reason: 'they_married', partner: mb.a === b ? mb.b : mb.a };
    if (!sb.proposals) return { ok: false, reason: 'closed' };
    const rel = R.relate(await snapshot(a), a, b);
    if (rel?.close) return { ok: false, reason: 'related', relation: rel };
    return { ok: true };
}

async function checkAdopt(parent, child) {
    if (parent === child) return { ok: false, reason: 'self' };
    const [row, mc, sc] = await Promise.all([store().getChildRow(child), store().getMarriage(child), store().getSettings(child)]);
    const mp = await store().getMarriage(parent);
    const spouse = mp ? (mp.a === parent ? mp.b : mp.a) : null;
    if (spouse === child) return { ok: false, reason: 'spouse' };
    if (row) return { ok: false, reason: 'has_parent' };
    if (mc) return { ok: false, reason: 'child_married' };
    if (!sc.adoptions) return { ok: false, reason: 'closed' };
    const S = await snapshot(parent);
    if (R.ancestors(S, parent).has(child)) return { ok: false, reason: 'ancestor' };

    const [mine, myLimit] = [(await store().getChildrenOf(parent)).length, await limitFor(parent)];
    if (mine >= myLimit) return { ok: false, reason: 'full', count: mine, limit: myLimit };
    if (spouse) {
        const [theirs, theirLimit] = [(await store().getChildrenOf(spouse)).length, await limitFor(spouse)];
        if (theirs >= theirLimit) return { ok: false, reason: 'spouse_full', count: theirs, limit: theirLimit, spouse };
    }
    return { ok: true, spouse };
}

/* ── actions ──────────────────────────────────────────────────────────── */

async function marry(a, b) {
    const c = await checkMarry(a, b);
    if (!c.ok) return c;
    await store().createMarriage(a, b);
    return { ok: true, at: Date.now() };
}

async function adopt(parent, child) {
    const c = await checkAdopt(parent, child);
    if (!c.ok) return c;
    await store().createChild({ childId: child, parentId: parent, coParentId: c.spouse || null });
    return { ok: true, coParent: c.spouse || null, at: Date.now() };
}

/** Marriage ends. Children stay with the parent who adopted them; the ex stops being their co-parent. */
async function divorce(u) {
    const m = await store().getMarriage(u);
    if (!m) return { ok: false, reason: 'not_married' };
    const ex = m.a === u ? m.b : m.a;
    await store().deleteMarriage(u);
    let kids = 0;
    for (const r of await store().getChildrenOf(u)) {
        if ((r.parentId === u && r.coParentId === ex) || (r.parentId === ex && r.coParentId === u)) { await store().updateChild(r.childId, { coParentId: null }); kids++; }
    }
    return { ok: true, ex, since: m.at, kids };
}

/** `parent` stops being a parent of `child`. */
async function disown(parent, child) {
    const row = await store().getChildRow(child);
    if (!row || (row.parentId !== parent && row.coParentId !== parent)) return { ok: false, reason: 'not_yours' };
    if (row.parentId === parent) {
        if (row.coParentId) await store().updateChild(child, { parentId: row.coParentId, coParentId: null });
        else await store().deleteChild(child);
    } else await store().updateChild(child, { coParentId: null });
    return { ok: true, orphaned: !(row.parentId === parent ? row.coParentId : row.parentId), row };
}

async function runaway(child) {
    const row = await store().getChildRow(child);
    if (!row) return { ok: false, reason: 'no_parents' };
    await store().deleteChild(child);
    return { ok: true, parents: [row.parentId, row.coParentId].filter(Boolean) };
}

/** Marriage, children and parents all cleared in one step. */
async function leave(u) {
    const out = { ok: true, ex: null, children: 0, parents: 0 };
    const m = await store().getMarriage(u);
    if (m) { const d = await divorce(u); out.ex = d.ex; }
    for (const r of await store().getChildrenOf(u)) { await disown(u, r.childId); out.children++; }
    const row = await store().getChildRow(u);
    if (row) { await store().deleteChild(u); out.parents = [row.parentId, row.coParentId].filter(Boolean).length; }
    if (!out.ex && !out.children && !out.parents) return { ok: false, reason: 'alone' };
    return out;
}

/* ── views ────────────────────────────────────────────────────────────── */

/** Everything the profile card needs. */
async function profile(u) {
    const S = await snapshot(u);
    const sibs = R.siblings(S, u);
    const limit = await limitFor(u);
    return {
        id: u, S,
        spouse: S.spouse.get(u) || null, marriedAt: S.marriedAt.get(u) || null,
        parents: S.parents.get(u) || [],
        children: (S.children.get(u) || []).slice(),
        siblings: [...sibs.entries()].map(([id, kind]) => ({ id, half: kind === 'half' })),
        size: S.people.size, truncated: S.truncated,
        limit, premium: limit === LIMIT.premium, adoptedAt: S.adoptedAt.get(u) || null,
    };
}

async function relationship(a, b) {
    const S = await snapshot(a);
    if (!S.people.has(b)) { const S2 = await snapshot(b); if (S2.people.has(a)) return { S: S2, rel: R.relate(S2, a, b) }; }
    return { S, rel: R.relate(S, a, b) };
}

const getSettings = (u) => store().getSettings(u);
const setSetting = async (u, key, value) => { await store().setSettings(u, { [key]: !!value }); return store().getSettings(u); };

module.exports = {
    LIMIT, checkMarry, checkAdopt, marry, adopt, divorce, disown, runaway, leave,
    snapshot, profile, relationship, getSettings, setSetting, limitFor, isPremium,
    clearPremiumCache: () => premiumCache.clear(),
    _test: { setStore(s) { _store = s; }, setPremium(fn) { _premium = fn; } },
};
