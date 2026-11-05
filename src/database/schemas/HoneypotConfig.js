// Honeypot — one trap channel per server.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class HoneypotConfig extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                guildId:   { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                channelId: { type: DataTypes.STRING, allowNull: false },
                messageId: { type: DataTypes.STRING, allowNull: true },                       // the pinned warning
                action:    { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ban' },   // ban | softban | kick | timeout
                caught:    { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
                logId:     { type: DataTypes.STRING, allowNull: true },
            },
            { sequelize, modelName: 'HoneypotConfig', tableName: 'honeypot_config', timestamps: true }
        );
        return this;
    }
}

module.exports = HoneypotConfig;
