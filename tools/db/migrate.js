#!/usr/bin/env node
// grace · copy every table from the old database to the new one, from a terminal.
//   OLD_DATABASE_URL=…  DATABASE_URL=…  node tools/db/migrate.js [--dry] [--truncate]
// No terminal? Skip this: set OLD_DATABASE_URL in the panel and start the bot, it copies by itself (see DATABASE.md).
// The new database needs its tables first: start the bot once against it, then stop it.

const { Pool } = require('pg');
const { copyAll } = require('../../src/services/dbMigrate');

const OLD = process.env.OLD_DATABASE_URL, NEW = process.env.DATABASE_URL;
if (!OLD || !NEW) { console.error('Set OLD_DATABASE_URL and DATABASE_URL.'); process.exit(1); }
if (OLD === NEW) { console.error('OLD_DATABASE_URL and DATABASE_URL are the same.'); process.exit(1); }
const ssl = (u) => { try { const x = new URL(u); return x.hostname.includes('.') && !/^(127\.|10\.|192\.168\.)/.test(x.hostname) && x.searchParams.get('sslmode') !== 'disable' ? { rejectUnauthorized: false } : false; } catch { return false; } };
const src = new Pool({ connectionString: OLD, ssl: ssl(OLD), max: 2 });
const dst = new Pool({ connectionString: NEW, ssl: ssl(NEW), max: 2 });

copyAll(src, dst, { dry: process.argv.includes('--dry'), truncate: process.argv.includes('--truncate') })
  .then((r) => {
    if (r.missing.length) console.log(`\nNot in the new database: ${r.missing.join(', ')}`);
    console.log(r.ok ? '\nAll rows copied.' : `\nNeeds a look: ${r.short.join('; ')}`);
    return Promise.all([src.end(), dst.end()]);
  })
  .catch((e) => { console.error('Migration stopped:', e.message); process.exit(1); });
