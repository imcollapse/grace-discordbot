// grace · member profile card settings (tagline, bio, location, theme ...) plus the uploaded banner picture.

const { pool, getOne, run } = require('./pg');

const dbReady = (async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS profile_cards (
            user_id TEXT PRIMARY KEY,
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at BIGINT NOT NULL DEFAULT 0
        )
    `);
    await pool.query('ALTER TABLE profile_cards ADD COLUMN IF NOT EXISTS banner BYTEA');
})();

async function get(userId) {
    const row = await getOne('SELECT data FROM profile_cards WHERE user_id = $1', [String(userId)]);
    return row?.data ?? {};
}

/** Merge `patch` into the saved settings. A key set to null (or '') is removed. */
async function set(userId, patch) {
    const cur = await get(userId);
    const next = { ...cur };
    for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete next[k];
        else next[k] = v;
    }
    await run(
        `INSERT INTO profile_cards (user_id, data, updated_at) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [String(userId), JSON.stringify(next), Date.now()],
    );
    return next;
}

/** The uploaded banner as a Buffer, or null. */
async function getBanner(userId) {
    const row = await getOne('SELECT banner FROM profile_cards WHERE user_id = $1', [String(userId)]);
    return row?.banner ?? null;
}

/** Save (or with null, remove) the banner picture. */
async function setBanner(userId, buffer) {
    await run(
        `INSERT INTO profile_cards (user_id, data, updated_at, banner) VALUES ($1, '{}'::jsonb, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET banner = EXCLUDED.banner, updated_at = EXCLUDED.updated_at`,
        [String(userId), Date.now(), buffer ?? null],
    );
}

const clear = (userId) => run('DELETE FROM profile_cards WHERE user_id = $1', [String(userId)]);

module.exports = { dbReady, get, set, getBanner, setBanner, clear };
