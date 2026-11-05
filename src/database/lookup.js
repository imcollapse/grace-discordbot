// grace · storage for the lookup panel (names the bot has seen released), captcha passes and vanity watches.
// Tables start with "lk_" (anything starting with "vanity" is dropped at startup).

const { pool, getOne, getAll, run } = require('./pg');

async function init() {
    await pool.query(`CREATE TABLE IF NOT EXISTS lk_names (
        kind TEXT NOT NULL, name TEXT NOT NULL, dropped_at TIMESTAMPTZ NOT NULL DEFAULT now(), source TEXT,
        PRIMARY KEY (kind, name))`);
    await pool.query('CREATE INDEX IF NOT EXISTS lk_names_time ON lk_names (kind, dropped_at DESC)');
    await pool.query('CREATE TABLE IF NOT EXISTS lk_pass (user_id TEXT PRIMARY KEY, until TIMESTAMPTZ NOT NULL)');
    await pool.query(`CREATE TABLE IF NOT EXISTS lk_watch (
        user_id TEXT NOT NULL, code TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, code))`);
}
const dbReady = init();

/* ── released names ────────────────────────────────────────────────── */

const drop = (kind, name, source = null) =>
    run(`INSERT INTO lk_names (kind, name, source) VALUES ($1, $2, $3)
         ON CONFLICT (kind, name) DO UPDATE SET dropped_at = now(), source = $3`, [kind, name.toLowerCase(), source]);
const take = (kind, name) => run('DELETE FROM lk_names WHERE kind = $1 AND name = $2', [kind, name.toLowerCase()]);
const dropped = (kind, name) => getOne('SELECT name, dropped_at FROM lk_names WHERE kind = $1 AND name = $2', [kind, name.toLowerCase()]);

const esc = (s) => s.replace(/[\\%_]/g, '\\$&');
const SORTS = {
    new: 'dropped_at DESC, name', old: 'dropped_at ASC, name', az: 'name ASC', za: 'name DESC',
    short: 'length(name) ASC, name', long: 'length(name) DESC, name',
};
const CHARS = { all: null, alnum: '^[a-z0-9]+$', letters: '^[a-z]+$', numbers: '^[0-9]+$' };

/** Page of released names. f: { q, mode, min, max, chars, sort } */
async function search(kind, f = {}, limit = 10, offset = 0) {
    const where = ['kind = $1'], args = [kind];
    const add = (sql, v) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)); };
    if (f.q) {
        const q = esc(f.q.toLowerCase());
        if (f.mode === 'exact') add('name = ?', f.q.toLowerCase());
        else add("name LIKE ? ESCAPE '\\'", f.mode === 'starts' ? `${q}%` : f.mode === 'ends' ? `%${q}` : `%${q}%`);
    }
    if (f.min) add('length(name) >= ?', f.min);
    if (f.max) add('length(name) <= ?', f.max);
    if (CHARS[f.chars]) add('name ~ ?', CHARS[f.chars]);
    const w = where.join(' AND ');
    const total = Number((await getOne(`SELECT count(*) AS n FROM lk_names WHERE ${w}`, args)).n);
    const rows = await getAll(`SELECT name, dropped_at FROM lk_names WHERE ${w} ORDER BY ${SORTS[f.sort] ?? SORTS.new} LIMIT ${limit} OFFSET ${offset}`, args);
    return { total, rows };
}
const count = async (kind) => Number((await getOne('SELECT count(*) AS n FROM lk_names WHERE kind = $1', [kind])).n);

/* ── captcha passes ────────────────────────────────────────────────── */

const getPass = async (userId) => (await getOne('SELECT until FROM lk_pass WHERE user_id = $1', [userId]))?.until ?? null;
const setPass = (userId, until) => run(`INSERT INTO lk_pass (user_id, until) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET until = $2`, [userId, until]);

/* ── vanity watches ────────────────────────────────────────────────── */

const watchAdd = (userId, code) => run('INSERT INTO lk_watch (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, code]);
const watchRemove = (userId, code) => run('DELETE FROM lk_watch WHERE user_id = $1 AND code = $2', [userId, code]);
const watchOf = (userId) => getAll('SELECT code, created_at FROM lk_watch WHERE user_id = $1 ORDER BY created_at', [userId]);
const watchAll = () => getAll('SELECT user_id, code FROM lk_watch');
const watchCount = async (userId) => Number((await getOne('SELECT count(*) AS n FROM lk_watch WHERE user_id = $1', [userId])).n);
const watchClear = (code) => run('DELETE FROM lk_watch WHERE code = $1', [code]);

module.exports = { dbReady, drop, take, dropped, search, count, getPass, setPass, watchAdd, watchRemove, watchOf, watchAll, watchCount, watchClear };
