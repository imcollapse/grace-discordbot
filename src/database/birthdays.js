// grace · birthdays. A member sets their birthday once and it works in every server that turned birthdays on.

const { pool, getOne, getAll, run } = require('./pg');

const dbReady = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS birthdays (
        user_id TEXT PRIMARY KEY, month INT NOT NULL, day INT NOT NULL, year INT
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS birthdays_md ON birthdays (month, day)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS birthday_guild (
        guild_id TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        channel_id TEXT,
        message TEXT,
        ping BOOLEAN NOT NULL DEFAULT TRUE,
        tz INT NOT NULL DEFAULT 0
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS birthday_sent (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, year INT NOT NULL,
        PRIMARY KEY (guild_id, user_id, year)
    )`);
})();

const getUser = (userId) => getOne('SELECT * FROM birthdays WHERE user_id = $1', [String(userId)]);
const setUser = (userId, month, day, year = null) => run(
    `INSERT INTO birthdays (user_id, month, day, year) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET month = EXCLUDED.month, day = EXCLUDED.day, year = EXCLUDED.year`,
    [String(userId), month, day, year],
);
const removeUser = (userId) => run('DELETE FROM birthdays WHERE user_id = $1', [String(userId)]);
const onDay = (month, day) => getAll('SELECT * FROM birthdays WHERE month = $1 AND day = $2', [month, day]);
const all = () => getAll('SELECT * FROM birthdays');

async function guild(guildId) {
    return (await getOne('SELECT * FROM birthday_guild WHERE guild_id = $1', [String(guildId)]))
        ?? { guild_id: String(guildId), enabled: false, channel_id: null, message: null, ping: true, tz: 0 };
}
async function setGuild(guildId, patch) {
    const cur = await guild(guildId);
    const n = { ...cur, ...patch };
    await run(
        `INSERT INTO birthday_guild (guild_id, enabled, channel_id, message, ping, tz) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (guild_id) DO UPDATE SET enabled = EXCLUDED.enabled, channel_id = EXCLUDED.channel_id,
           message = EXCLUDED.message, ping = EXCLUDED.ping, tz = EXCLUDED.tz`,
        [String(guildId), n.enabled, n.channel_id, n.message, n.ping, n.tz],
    );
    return n;
}
const enabledGuilds = () => getAll('SELECT * FROM birthday_guild WHERE enabled = TRUE AND channel_id IS NOT NULL');

const wasSent = async (guildId, userId, year) => !!(await getOne('SELECT 1 AS x FROM birthday_sent WHERE guild_id = $1 AND user_id = $2 AND year = $3', [String(guildId), String(userId), year]));
const markSent = (guildId, userId, year) => run('INSERT INTO birthday_sent (guild_id, user_id, year) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [String(guildId), String(userId), year]);
const prune = (year) => run('DELETE FROM birthday_sent WHERE year < $1', [year - 1]);

module.exports = { dbReady, getUser, setUser, removeUser, onDay, all, guild, setGuild, enabledGuilds, wasSent, markSent, prune };
