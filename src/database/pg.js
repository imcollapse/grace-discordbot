// [dev] cosmin :: database/pg.js

const { Pool } = require('pg');
const db = require('./connection');

const pool = new Pool({
    connectionString: db.url(),
    ssl: db.ssl(),
    max: Math.max(2, Math.ceil(db.poolMax() / 2)),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
});

const query = async (text, params) => {
    const res = await pool.query(text, params);
    return res;
};

const getOne = async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows[0] || null;
};

const getAll = async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows;
};

const run = async (text, params) => {
    const res = await pool.query(text, params);
    return { changes: res.rowCount };
};

module.exports = { pool, query, getOne, getAll, run };
