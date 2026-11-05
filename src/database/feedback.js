/** @author cosmin */

const { pool, getOne, getAll, run } = require('./pg');

async function initializeDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS feedback_config (
            guild_id TEXT PRIMARY KEY,
            review_channel_id TEXT,
            log_channel_id TEXT
        );
    `);
    await pool.query(`ALTER TABLE feedback_config ADD COLUMN IF NOT EXISTS ping_role_id TEXT`);
    await pool.query(`ALTER TABLE feedback_config ADD COLUMN IF NOT EXISTS panel_channel_id TEXT`);
    await pool.query(`ALTER TABLE feedback_config ADD COLUMN IF NOT EXISTS panel_message_id TEXT`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS feedback_reviews (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            rating SMALLINT NOT NULL,
            body TEXT NOT NULL,
            image TEXT,
            message_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS feedback_reviews_guild ON feedback_reviews (guild_id, created_at DESC)`);
}

const getConfig = (guildId) =>
    getOne('SELECT * FROM feedback_config WHERE guild_id = $1', [guildId]);

/** Save the channels (and optionally the ping role). Keeps the panel message that is already out. */
const setConfig = (guildId, reviewChannelId, logChannelId, pingRoleId = null) =>
    run(
        `INSERT INTO feedback_config (guild_id, review_channel_id, log_channel_id, ping_role_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = $2, log_channel_id = $3, ping_role_id = $4`,
        [guildId, reviewChannelId, logChannelId, pingRoleId]
    );

const setPanel = (guildId, channelId, messageId) =>
    run('UPDATE feedback_config SET panel_channel_id = $2, panel_message_id = $3 WHERE guild_id = $1', [guildId, channelId, messageId]);

const deleteConfig = (guildId) =>
    run('DELETE FROM feedback_config WHERE guild_id = $1', [guildId]);

/** @returns the saved review with its number */
const addReview = async (guildId, userId, rating, body, image) =>
    getOne('INSERT INTO feedback_reviews (guild_id, user_id, rating, body, image) VALUES ($1, $2, $3, $4, $5) RETURNING *', [guildId, userId, rating, body, image || null]);

const setReviewMessage = (id, messageId) => run('UPDATE feedback_reviews SET message_id = $2 WHERE id = $1', [id, messageId]);

const lastReviewAt = async (guildId, userId) =>
    (await getOne('SELECT created_at FROM feedback_reviews WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1', [guildId, userId]))?.created_at ?? null;

/** { count, avg, dist: [ones, twos, threes, fours, fives] } */
async function stats(guildId) {
    const r = await getOne(
        `SELECT count(*)::int AS n, COALESCE(avg(rating), 0)::float AS avg,
                count(*) FILTER (WHERE rating = 1)::int AS r1, count(*) FILTER (WHERE rating = 2)::int AS r2,
                count(*) FILTER (WHERE rating = 3)::int AS r3, count(*) FILTER (WHERE rating = 4)::int AS r4,
                count(*) FILTER (WHERE rating = 5)::int AS r5
           FROM feedback_reviews WHERE guild_id = $1`, [guildId]);
    return { count: r?.n ?? 0, avg: r?.avg ?? 0, dist: [r?.r1 ?? 0, r?.r2 ?? 0, r?.r3 ?? 0, r?.r4 ?? 0, r?.r5 ?? 0] };
}

const recent = (guildId, limit = 5) =>
    getAll('SELECT * FROM feedback_reviews WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2', [guildId, limit]);

const dbReady = initializeDatabase();

module.exports = { dbReady, getConfig, setConfig, setPanel, deleteConfig, addReview, setReviewMessage, lastReviewAt, stats, recent };
