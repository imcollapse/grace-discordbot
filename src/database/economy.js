// grace · storage for the per-server economy.
// Tables: eco_guild (settings), eco_user (wallet, bank, job, streak), eco_cd (cooldowns and timed flags),
// eco_inv (items people own), eco_shop (items admins added, premium servers), eco_invest (market holdings).
// Money only moves through atomic UPDATEs that refuse to go below zero, so two quick commands can't double spend.

const { pool, getOne, getAll, run } = require('./pg');

// Money, items, cooldowns and shares follow the person across every server (stored under one shared key).
// Only the settings and the server shop belong to a server.
const G = 'global';

const START_WALLET = 100;
const START_CAP = 5000;

async function init() {
    await pool.query(`CREATE TABLE IF NOT EXISTS eco_guild (
        guild_id TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT false, currency TEXT NOT NULL DEFAULT 'coins',
        max_bet BIGINT NOT NULL DEFAULT 500, drops BOOLEAN NOT NULL DEFAULT false, drop_channel TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS eco_user (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        wallet BIGINT NOT NULL DEFAULT ${START_WALLET}, bank BIGINT NOT NULL DEFAULT 0, bank_cap BIGINT NOT NULL DEFAULT ${START_CAP},
        job TEXT NOT NULL DEFAULT 'cashier', shifts INT NOT NULL DEFAULT 0,
        streak INT NOT NULL DEFAULT 0, best_streak INT NOT NULL DEFAULT 0, last_daily TIMESTAMPTZ,
        earned BIGINT NOT NULL DEFAULT 0, bank_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (guild_id, user_id))`);
    await pool.query('CREATE INDEX IF NOT EXISTS eco_user_rank ON eco_user (guild_id, (wallet + bank) DESC)');
    await pool.query(`CREATE TABLE IF NOT EXISTS eco_cd (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, cmd TEXT NOT NULL, until TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (guild_id, user_id, cmd))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS eco_inv (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, item TEXT NOT NULL, qty INT NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, item))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS eco_shop (
        id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, slot INT NOT NULL, name TEXT NOT NULL, description TEXT,
        price BIGINT NOT NULL, role_id TEXT, stock INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (guild_id, slot))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS eco_invest (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, asset TEXT NOT NULL, qty INT NOT NULL DEFAULT 0, spent BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, asset))`);
}
const dbReady = init().then(() => pool.query("UPDATE eco_invest SET asset = 'grace' WHERE asset IN ('hope', 'evoke', 'reze')").catch(() => {}));

/* ── server settings ───────────────────────────────────────────────── */

const gcache = new Map();
const DEFAULT_GUILD = { enabled: false, currency: 'coins', max_bet: 500, drops: false, drop_channel: null };

async function guild(guildId) {
    const hit = gcache.get(guildId);
    if (hit && Date.now() - hit.at < 15000) return hit.row;
    const row = (await getOne('SELECT * FROM eco_guild WHERE guild_id = $1', [guildId])) || { guild_id: guildId, ...DEFAULT_GUILD };
    row.max_bet = Number(row.max_bet);
    gcache.set(guildId, { row, at: Date.now() });
    return row;
}

const COLS = new Set(['enabled', 'currency', 'max_bet', 'drops', 'drop_channel']);
async function setGuild(guildId, patch) {
    const keys = Object.keys(patch).filter((k) => COLS.has(k));
    if (!keys.length) return guild(guildId);
    const cols = ['guild_id', ...keys];
    const vals = [guildId, ...keys.map((k) => patch[k])];
    await run(`INSERT INTO eco_guild (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})
               ON CONFLICT (guild_id) DO UPDATE SET ${keys.map((k) => `${k} = EXCLUDED.${k}`).join(', ')}`, vals);
    gcache.delete(guildId);
    return guild(guildId);
}
const enabledGuilds = () => getAll('SELECT guild_id FROM eco_guild WHERE enabled').then((r) => r.map((x) => x.guild_id));

/* ── people ────────────────────────────────────────────────────────── */

const num = (r) => r && ({ ...r, wallet: Number(r.wallet), bank: Number(r.bank), bank_cap: Number(r.bank_cap), earned: Number(r.earned) });

/** The person's row, created on first use. */
async function user(_g, userId) {
    await run('INSERT INTO eco_user (guild_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [G, userId]);
    return num(await getOne('SELECT * FROM eco_user WHERE guild_id = $1 AND user_id = $2', [G, userId]));
}

/**
 * Change wallet and/or bank in one step. Returns the new row, or null when it would take either below zero.
 * `earn` adds to the lifetime total shown on the profile.
 */
async function change(_g, userId, { wallet = 0, bank = 0, earn = 0 } = {}) {
    await run('INSERT INTO eco_user (guild_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [G, userId]);
    return num(await getOne(
        `UPDATE eco_user SET wallet = wallet + $3, bank = bank + $4, earned = earned + $5
         WHERE guild_id = $1 AND user_id = $2 AND wallet + $3 >= 0 AND bank + $4 >= 0 RETURNING *`,
        [G, userId, Math.trunc(wallet), Math.trunc(bank), Math.trunc(earn)]));
}

const COLS_USER = new Set(['job', 'shifts', 'streak', 'best_streak', 'last_daily', 'bank_cap', 'bank_at']);
async function patchUser(_g, userId, patch) {
    const keys = Object.keys(patch).filter((k) => COLS_USER.has(k));
    if (!keys.length) return user(G, userId);
    await user(G, userId);
    return num(await getOne(
        `UPDATE eco_user SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE guild_id = $1 AND user_id = $2 RETURNING *`,
        [G, userId, ...keys.map((k) => patch[k])]));
}

/** Move money from one person to another in one transaction. */
async function transfer(_g, fromId, toId, amount) {
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        await c.query('INSERT INTO eco_user (guild_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [G, toId]);
        const out = await c.query('UPDATE eco_user SET wallet = wallet - $3 WHERE guild_id = $1 AND user_id = $2 AND wallet >= $3 RETURNING wallet', [G, fromId, amount]);
        if (!out.rowCount) { await c.query('ROLLBACK'); return false; }
        await c.query('UPDATE eco_user SET wallet = wallet + $3 WHERE guild_id = $1 AND user_id = $2', [G, toId, amount]);
        await c.query('COMMIT');
        return true;
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
}

async function wipeUser(_g, userId) {
    for (const t of ['eco_user', 'eco_cd', 'eco_inv', 'eco_invest']) await run(`DELETE FROM ${t} WHERE guild_id = $1 AND user_id = $2`, [G, userId]);
}
/** Nothing to wipe per server any more: money follows people across servers. */
const wipeGuild = async () => {};

/** Richest first among the given member ids. */
const top = (ids, limit = 10, offset = 0) =>
    getAll('SELECT user_id, wallet, bank, wallet + bank AS total FROM eco_user WHERE guild_id = $1 AND user_id = ANY($2) ORDER BY total DESC, user_id LIMIT $3 OFFSET $4', [G, ids, limit, offset]);
const countUsers = (ids) => getOne('SELECT count(*)::int AS n FROM eco_user WHERE guild_id = $1 AND user_id = ANY($2)', [G, ids]).then((r) => r.n);
const rankOf = (ids, userId) => getOne(
    `SELECT count(*)::int + 1 AS rank FROM eco_user WHERE guild_id = $1 AND user_id = ANY($2) AND wallet + bank > COALESCE((SELECT wallet + bank FROM eco_user WHERE guild_id = $1 AND user_id = $3), 0)`,
    [G, ids, userId]).then((r) => r.rank);

/* ── cooldowns and timed flags ─────────────────────────────────────── */

/** Start a cooldown if none is running. Returns null when it started, or the time it ends when still running. */
async function claim(_g, userId, cmd, ms) {
    const row = await getOne(
        `INSERT INTO eco_cd (guild_id, user_id, cmd, until) VALUES ($1, $2, $3, now() + ($4 || ' milliseconds')::interval)
         ON CONFLICT (guild_id, user_id, cmd) DO UPDATE SET until = EXCLUDED.until WHERE eco_cd.until <= now() RETURNING until`,
        [G, userId, cmd, String(Math.trunc(ms))]);
    if (row) return null;
    return new Date((await getOne('SELECT until FROM eco_cd WHERE guild_id = $1 AND user_id = $2 AND cmd = $3', [G, userId, cmd])).until);
}
/** Give a cooldown back (the command failed before doing anything). */
const clearCd = (_g, userId, cmd) => run('DELETE FROM eco_cd WHERE guild_id = $1 AND user_id = $2 AND cmd = $3', [G, userId, cmd]);
/** Set a timed flag, e.g. a padlock that lasts 12 hours. */
const setFlag = (_g, userId, cmd, ms) => run(
    `INSERT INTO eco_cd (guild_id, user_id, cmd, until) VALUES ($1, $2, $3, now() + ($4 || ' milliseconds')::interval)
     ON CONFLICT (guild_id, user_id, cmd) DO UPDATE SET until = EXCLUDED.until`, [G, userId, cmd, String(Math.trunc(ms))]);
/** When a flag ends, or null when it is not active. */
const flag = async (_g, userId, cmd) => {
    const r = await getOne('SELECT until FROM eco_cd WHERE guild_id = $1 AND user_id = $2 AND cmd = $3 AND until > now()', [G, userId, cmd]);
    return r ? new Date(r.until) : null;
};

/* ── items ─────────────────────────────────────────────────────────── */

const inventory = (_g, userId) => getAll('SELECT item, qty FROM eco_inv WHERE guild_id = $1 AND user_id = $2 AND qty > 0 ORDER BY item', [G, userId]);
const owned = async (_g, userId, item) => (await getOne('SELECT qty FROM eco_inv WHERE guild_id = $1 AND user_id = $2 AND item = $3', [G, userId, item]))?.qty ?? 0;
const addItem = (_g, userId, item, qty = 1) => run(
    `INSERT INTO eco_inv (guild_id, user_id, item, qty) VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, user_id, item) DO UPDATE SET qty = eco_inv.qty + EXCLUDED.qty`, [G, userId, item, qty]);
/** Take items away. False when they don't have that many. */
const takeItem = async (_g, userId, item, qty = 1) =>
    (await run('UPDATE eco_inv SET qty = qty - $4 WHERE guild_id = $1 AND user_id = $2 AND item = $3 AND qty >= $4', [G, userId, item, qty])).changes > 0;

/* ── server shop (premium servers) ─────────────────────────────────── */

const shopItems = (guildId) => getAll('SELECT * FROM eco_shop WHERE guild_id = $1 ORDER BY slot', [guildId])
    .then((rows) => rows.map((r) => ({ ...r, price: Number(r.price) })));
const shopItem = (guildId, slot) => getOne('SELECT * FROM eco_shop WHERE guild_id = $1 AND slot = $2', [guildId, slot])
    .then((r) => r && { ...r, price: Number(r.price) });
async function shopAdd(guildId, { name, description = null, price, roleId = null, stock = null }) {
    const used = new Set((await getAll('SELECT slot FROM eco_shop WHERE guild_id = $1', [guildId])).map((r) => r.slot));
    let slot = 1; while (used.has(slot)) slot++;
    await run('INSERT INTO eco_shop (guild_id, slot, name, description, price, role_id, stock) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [guildId, slot, name, description, price, roleId, stock]);
    return slot;
}
const shopRemove = async (guildId, slot) => (await run('DELETE FROM eco_shop WHERE guild_id = $1 AND slot = $2', [guildId, slot])).changes > 0;
const SHOP_COLS = new Set(['name', 'description', 'price', 'stock', 'role_id']);
async function shopEdit(guildId, slot, patch) {
    const keys = Object.keys(patch).filter((k) => SHOP_COLS.has(k));
    if (!keys.length) return false;
    return (await run(`UPDATE eco_shop SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE guild_id = $1 AND slot = $2`,
        [guildId, slot, ...keys.map((k) => patch[k])])).changes > 0;
}
/** Take one from the stock (unlimited stock is NULL). False when sold out. */
const shopTake = async (guildId, slot, qty = 1) =>
    (await run('UPDATE eco_shop SET stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - $3 END WHERE guild_id = $1 AND slot = $2 AND (stock IS NULL OR stock >= $3)', [guildId, slot, qty])).changes > 0;
const shopGive = (guildId, slot, qty = 1) => run('UPDATE eco_shop SET stock = stock + $3 WHERE guild_id = $1 AND slot = $2 AND stock IS NOT NULL', [guildId, slot, qty]);

/* ── market holdings ───────────────────────────────────────────────── */

const holdings = (_g, userId) => getAll('SELECT asset, qty, spent FROM eco_invest WHERE guild_id = $1 AND user_id = $2 AND qty > 0 ORDER BY asset', [G, userId])
    .then((rows) => rows.map((r) => ({ ...r, spent: Number(r.spent) })));
const addHolding = (_g, userId, asset, qty, spent) => run(
    `INSERT INTO eco_invest (guild_id, user_id, asset, qty, spent) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (guild_id, user_id, asset) DO UPDATE SET qty = eco_invest.qty + EXCLUDED.qty, spent = eco_invest.spent + EXCLUDED.spent`,
    [G, userId, asset, qty, spent]);
/** Sell shares; returns the cost basis that went with them, or null when they don't hold that many. */
async function takeHolding(_g, userId, asset, qty) {
    const row = await getOne(
        `UPDATE eco_invest SET spent = spent - (spent * $4 / qty), qty = qty - $4
         WHERE guild_id = $1 AND user_id = $2 AND asset = $3 AND qty >= $4 RETURNING qty`, [G, userId, asset, qty]);
    return !!row;
}

module.exports = {
    dbReady, G, START_WALLET, START_CAP,
    guild, setGuild, enabledGuilds,
    user, change, patchUser, transfer, wipeUser, wipeGuild, top, countUsers, rankOf,
    claim, clearCd, setFlag, flag,
    inventory, owned, addItem, takeItem,
    shopItems, shopItem, shopAdd, shopRemove, shopEdit, shopTake, shopGive,
    holdings, addHolding, takeHolding,
};
