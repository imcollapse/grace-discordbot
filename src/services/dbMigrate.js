// grace · copy every table from one Postgres database to another (used for the move off Neon).
//   copyAll(src, dst, { truncate, dry, log })   src and dst are pg Pools. Rows that already exist are skipped.
//   runIfRequested()                            called at startup; copies once when OLD_DATABASE_URL is set

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
const MARK = 'neon-copy';

async function tables(pool) {
  const r = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`);
  return r.rows.map(x => x.table_name);
}
async function columns(pool, table) {
  const r = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]);
  return r.rows;
}

async function copyTable(src, dst, table, { truncate, dry }) {
  const [sc, dc] = [await columns(src, table), await columns(dst, table)];
  const have = new Set(dc.map(c => c.column_name));
  const cols = sc.filter(c => have.has(c.column_name));
  const dropped = sc.filter(c => !have.has(c.column_name)).map(c => c.column_name);
  const json = new Set(cols.filter(c => /^json/.test(c.data_type)).map(c => c.column_name));
  const total = Number((await src.query(`SELECT count(*) AS n FROM ${q(table)}`)).rows[0].n);
  if (dry || !cols.length) return { table, total, copied: 0, dropped };

  if (truncate) await dst.query(`TRUNCATE ${q(table)} RESTART IDENTITY CASCADE`);
  const names = cols.map(c => q(c.column_name)).join(', ');
  const size = Math.max(1, Math.min(500, Math.floor(60000 / cols.length)));
  let copied = 0;
  for (let offset = 0; offset < total; offset += size) {
    const rows = (await src.query(`SELECT ${names} FROM ${q(table)} ORDER BY ctid LIMIT ${size} OFFSET ${offset}`)).rows;
    if (!rows.length) break;
    const values = [], marks = [];
    for (const row of rows) {
      marks.push(`(${cols.map(c => {
        const v = row[c.column_name];
        values.push(json.has(c.column_name) && v !== null ? JSON.stringify(v) : v);
        return `$${values.length}`;
      }).join(', ')})`);
    }
    const r = await dst.query(`INSERT INTO ${q(table)} (${names}) VALUES ${marks.join(', ')} ON CONFLICT DO NOTHING`, values);
    copied += r.rowCount ?? 0;
  }
  // keep auto-increment counters ahead of the copied ids
  for (const c of cols) {
    const seq = (await dst.query(`SELECT pg_get_serial_sequence($1, $2) AS s`, [q(table), c.column_name])).rows[0]?.s;
    if (seq) await dst.query(`SELECT setval($1, COALESCE((SELECT MAX(${q(c.column_name)}) FROM ${q(table)}), 1), (SELECT MAX(${q(c.column_name)}) IS NOT NULL FROM ${q(table)}))`, [seq]);
  }
  return { table, total, copied, dropped };
}

async function copyAll(src, dst, { truncate = false, dry = false, log = console.log } = {}) {
  const from = await tables(src);
  const to = new Set(await tables(dst));
  const report = [], missing = [];
  for (const t of from) {
    if (!to.has(t)) { missing.push(t); continue; }
    try {
      const r = await copyTable(src, dst, t, { truncate, dry });
      report.push(r);
      log(`  ${t.padEnd(32)} ${String(r.copied).padStart(8)} / ${r.total}${r.dropped.length ? `   (skipped columns: ${r.dropped.join(', ')})` : ''}`);
    } catch (e) {
      report.push({ table: t, failed: e.message });
      log(`  ${t.padEnd(32)} FAILED: ${e.message}`);
    }
  }
  // every row must be there
  const short = [];
  if (!dry) {
    for (const r of report) {
      if (r.failed) { short.push(`${r.table} (${r.failed})`); continue; }
      const n = Number((await dst.query(`SELECT count(*) AS n FROM ${q(r.table)}`)).rows[0].n);
      if (n < r.total) short.push(`${r.table} (${n} of ${r.total} rows)`);
    }
  }
  return { tables: from.length, report, missing, short, ok: !short.length };
}

/** Startup hook: copy once from OLD_DATABASE_URL into the database the bot is using. */
async function runIfRequested() {
  const OLD = process.env.OLD_DATABASE_URL;
  if (!OLD) return { skipped: true };
  const { Pool } = require('pg');
  const db = require('../database/connection');
  const dst = require('../database/pg').pool;
  const say = (m) => console.log(`[migrate] ${m}`);

  if (OLD === db.url()) { say('OLD_DATABASE_URL is the same as DATABASE_URL. Nothing to copy.'); return { skipped: true }; }
  await dst.query(`CREATE TABLE IF NOT EXISTS _hope_migrations (name TEXT PRIMARY KEY, done_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  if ((await dst.query(`SELECT 1 FROM _hope_migrations WHERE name = $1`, [MARK])).rowCount) {
    say('The copy was already done on this database. You can delete OLD_DATABASE_URL now.');
    return { skipped: true };
  }

  const src = new Pool({ connectionString: OLD, ssl: db.wantsSsl(OLD) ? { rejectUnauthorized: false } : false, max: 2, connectionTimeoutMillis: 20000 });
  try {
    say('Copying data from the old database. The bot is not online yet, so nothing changes while this runs.');
    const r = await copyAll(src, dst, { log: say });
    if (r.missing.length) say(`Tables only in the old database, left behind: ${r.missing.join(', ')}`);
    if (!r.ok) throw new Error(`these tables are incomplete: ${r.short.join('; ')}`);
    await dst.query(`INSERT INTO _hope_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`, [MARK]);
    say(`Done. ${r.report.reduce((a, x) => a + (x.copied || 0), 0)} rows copied across ${r.report.length} tables. Remove OLD_DATABASE_URL and restart.`);
    return { done: true };
  } finally { await src.end().catch(() => {}); }
}

module.exports = { copyAll, runIfRequested, tables };
