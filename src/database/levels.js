// grace · levels. XP per member per server, reward roles, ignored channels/roles and XP boosts.

const { pool, getOne, getAll, run } = require('./pg');

const dbReady = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS level_users (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        xp BIGINT NOT NULL DEFAULT 0, level INT NOT NULL DEFAULT 0,
        messages INT NOT NULL DEFAULT 0, voice_secs BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS level_users_xp ON level_users (guild_id, xp DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS level_guild (
        guild_id TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        mode TEXT NOT NULL DEFAULT 'same',
        channel_id TEXT,
        style TEXT NOT NULL DEFAULT 'default',
        message TEXT,
        embed JSONB,
        container TEXT,
        xp_min INT NOT NULL DEFAULT 15,
        xp_max INT NOT NULL DEFAULT 25,
        cooldown INT NOT NULL DEFAULT 60,
        voice BOOLEAN NOT NULL DEFAULT FALSE,
        stack BOOLEAN NOT NULL DEFAULT TRUE,
        auto_delete INT NOT NULL DEFAULT 0
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS level_roles (
        guild_id TEXT NOT NULL, level INT NOT NULL, role_id TEXT NOT NULL,
        PRIMARY KEY (guild_id, level)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS level_ignore (
        guild_id TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL,
        PRIMARY KEY (guild_id, kind, target_id)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS level_boost (
        guild_id TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL, mult REAL NOT NULL,
        PRIMARY KEY (guild_id, kind, target_id)
    )`);
})();

/* ---------- server settings ---------- */

const DEFAULTS = {
    enabled: false, mode: 'same', channel_id: null, style: 'default', message: null, embed: null, container: null,
    xp_min: 15, xp_max: 25, cooldown: 60, voice: false, stack: true, auto_delete: 0,
};
const COLS = Object.keys(DEFAULTS);

async function guild(guildId) {
    const row = await getOne('SELECT * FROM level_guild WHERE guild_id = $1', [String(guildId)]);
    return { guild_id: String(guildId), ...DEFAULTS, ...(row ?? {}) };
}

async function setGuild(guildId, patch) {
    const cur = await guild(guildId);
    const n = { ...cur, ...patch };
    const vals = COLS.map((c) => (c === 'embed' ? (n.embed == null ? null : JSON.stringify(n.embed)) : n[c]));
    await run(
        `INSERT INTO level_guild (guild_id, ${COLS.join(', ')}) VALUES ($1, ${COLS.map((c, i) => (c === 'embed' ? `$${i + 2}::jsonb` : `$${i + 2}`)).join(', ')})
         ON CONFLICT (guild_id) DO UPDATE SET ${COLS.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`,
        [String(guildId), ...vals],
    );
    return n;
}

const resetDesign = (guildId) => setGuild(guildId, { style: 'default', message: null, embed: null, container: null });
const enabledGuildIds = async () => (await getAll('SELECT guild_id FROM level_guild WHERE enabled = TRUE AND voice = TRUE')).map((r) => r.guild_id);

/* ---------- members ---------- */

const getUser = (guildId, userId) => getOne('SELECT * FROM level_users WHERE guild_id = $1 AND user_id = $2', [String(guildId), String(userId)]);

/** Add XP (and a message or voice time) and give back the row as it was *before* plus the new xp. */
async function addXp(guildId, userId, amount, { messages = 0, voiceSecs = 0 } = {}) {
    return getOne(
        `WITH old AS (SELECT xp, level FROM level_users WHERE guild_id = $1 AND user_id = $2)
         INSERT INTO level_users (guild_id, user_id, xp, messages, voice_secs) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET xp = level_users.xp + $3, messages = level_users.messages + $4, voice_secs = level_users.voice_secs + $5
         RETURNING xp, level, messages, voice_secs, COALESCE((SELECT level FROM old), 0) AS old_level`,
        [String(guildId), String(userId), amount, messages, voiceSecs],
    );
}
const setLevelCol = (guildId, userId, level) => run('UPDATE level_users SET level = $3 WHERE guild_id = $1 AND user_id = $2', [String(guildId), String(userId), level]);
const setUser = (guildId, userId, xp, level) => run(
    `INSERT INTO level_users (guild_id, user_id, xp, level) VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level`,
    [String(guildId), String(userId), xp, level],
);
const resetUser = (guildId, userId) => run('DELETE FROM level_users WHERE guild_id = $1 AND user_id = $2', [String(guildId), String(userId)]);
const resetGuild = (guildId) => run('DELETE FROM level_users WHERE guild_id = $1', [String(guildId)]);
const rankOf = async (guildId, xp) => Number((await getOne('SELECT COUNT(*) AS n FROM level_users WHERE guild_id = $1 AND xp > $2', [String(guildId), xp])).n) + 1;
const top = (guildId, limit, offset = 0) => getAll('SELECT * FROM level_users WHERE guild_id = $1 AND xp > 0 ORDER BY xp DESC, user_id LIMIT $2 OFFSET $3', [String(guildId), limit, offset]);
const count = async (guildId) => Number((await getOne('SELECT COUNT(*) AS n FROM level_users WHERE guild_id = $1 AND xp > 0', [String(guildId)])).n);

/* ---------- rewards, ignores, boosts ---------- */

const roles = (guildId) => getAll('SELECT level, role_id FROM level_roles WHERE guild_id = $1 ORDER BY level', [String(guildId)]);
const addRole = (guildId, level, roleId) => run(
    `INSERT INTO level_roles (guild_id, level, role_id) VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, level) DO UPDATE SET role_id = EXCLUDED.role_id`, [String(guildId), level, String(roleId)]);
const removeRole = (guildId, level) => run('DELETE FROM level_roles WHERE guild_id = $1 AND level = $2', [String(guildId), level]);
const removeRoleById = (guildId, roleId) => run('DELETE FROM level_roles WHERE guild_id = $1 AND role_id = $2', [String(guildId), String(roleId)]);

const ignores = (guildId) => getAll('SELECT kind, target_id FROM level_ignore WHERE guild_id = $1', [String(guildId)]);
/** Toggle; returns true when it is now ignored. */
async function toggleIgnore(guildId, kind, targetId) {
    const del = await run('DELETE FROM level_ignore WHERE guild_id = $1 AND kind = $2 AND target_id = $3', [String(guildId), kind, String(targetId)]);
    if (del.changes) return false;
    await run('INSERT INTO level_ignore (guild_id, kind, target_id) VALUES ($1, $2, $3)', [String(guildId), kind, String(targetId)]);
    return true;
}

const boosts = (guildId) => getAll('SELECT kind, target_id, mult FROM level_boost WHERE guild_id = $1', [String(guildId)]);
const setBoost = (guildId, kind, targetId, mult) => (mult === 1
    ? run('DELETE FROM level_boost WHERE guild_id = $1 AND kind = $2 AND target_id = $3', [String(guildId), kind, String(targetId)])
    : run(`INSERT INTO level_boost (guild_id, kind, target_id, mult) VALUES ($1, $2, $3, $4)
           ON CONFLICT (guild_id, kind, target_id) DO UPDATE SET mult = EXCLUDED.mult`, [String(guildId), kind, String(targetId), mult]));

module.exports = {
    dbReady, DEFAULTS, guild, setGuild, resetDesign, enabledGuildIds,
    getUser, addXp, setLevelCol, setUser, resetUser, resetGuild, rankOf, top, count,
    roles, addRole, removeRole, removeRoleById, ignores, toggleIgnore, boosts, setBoost,
};
