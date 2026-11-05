// grace · shared connection settings for Sequelize (database/sequelize.js) and the raw pool (database/pg.js).
//
//   DATABASE_URL     postgres://user:pass@host:5432/dbname
//   DATABASE_SSL     true | false. Leave empty to decide automatically:
//                    hosted databases (Neon, Supabase, …) use SSL; localhost, private IPs and
//                    docker service names such as "postgres" do not.
//   DB_POOL_MAX      most connections the bot keeps open (default 10, shared by both pools)

const config = require('../settings/index.js');

const url = () => process.env.DATABASE_URL || config.DATABASE_URL;

function wantsSsl(u = url()) {
    const flag = String(process.env.DATABASE_SSL ?? '').trim().toLowerCase();
    if (['false', '0', 'off', 'no', 'disable'].includes(flag)) return false;
    if (['true', '1', 'on', 'yes', 'require'].includes(flag)) return true;
    try {
        const parsed = new URL(u);
        const host = parsed.hostname;
        if (parsed.searchParams.get('sslmode') === 'disable') return false;
        if (!host.includes('.')) return false;                                   // "localhost", "postgres", "db"
        if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
    } catch (_) { /* odd URL: keep SSL on */ }
    return true;
}

const ssl = () => (wantsSsl() ? { require: true, rejectUnauthorized: false } : false);
const poolMax = () => Math.max(2, Number(process.env.DB_POOL_MAX) || 10);

module.exports = { url, wantsSsl, ssl, poolMax };
