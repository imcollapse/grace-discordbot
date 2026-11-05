// Jail — per-server setup: the jailed role and the jail channel.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class JailConfig extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                guildId:   { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                roleId:    { type: DataTypes.STRING, allowNull: false },
                channelId: { type: DataTypes.STRING, allowNull: true },
                logId:     { type: DataTypes.STRING, allowNull: true },
            },
            { sequelize, modelName: 'JailConfig', tableName: 'jail_config', timestamps: true }
        );
        return this;
    }
}

module.exports = JailConfig;
