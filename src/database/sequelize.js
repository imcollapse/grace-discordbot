/*
 * Developed by cosmin
 * File: database/sequelize.js
 */

const { Sequelize } = require('sequelize');
const config = require('../settings/index.js');

const db = require('./connection');

const DATABASE_URL = db.url();

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    define: {
        timestamps: true,
    },
    pool: {
        max: Math.max(2, Math.floor(db.poolMax() / 2)),
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    dialectOptions: db.wantsSsl() ? { ssl: db.ssl() } : {},
    retry: {
        max: 5,
        match: [
            /SequelizeConnectionError/,
            /SequelizeConnectionRefusedError/,
            /SequelizeHostNotFoundError/,
            /SequelizeHostNotReachableError/,
            /SequelizeInvalidConnectionError/,
            /SequelizeConnectionTimedOutError/,
            /ECONNRESET/,
            /ECONNREFUSED/,
        ],
    }
});

module.exports = sequelize;
