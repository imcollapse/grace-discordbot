// Twitch live notifications: one row per (server, streamer).

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class TwitchNotify extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                guildId:      { type: DataTypes.STRING, allowNull: false },
                channelId:    { type: DataTypes.STRING, allowNull: false },
                twitchId:     { type: DataTypes.STRING, allowNull: false },
                login:        { type: DataTypes.STRING, allowNull: false },
                name:         { type: DataTypes.STRING, allowNull: false },
                roleId:       { type: DataTypes.STRING, allowNull: true },
                message:      { type: DataTypes.TEXT, allowNull: true },
                lastStreamId: { type: DataTypes.STRING, allowNull: true },
                addedBy:      { type: DataTypes.STRING, allowNull: true },
            },
            {
                sequelize, modelName: 'TwitchNotify', tableName: 'twitch_notify', timestamps: true,
                indexes: [{ unique: true, fields: ['guildId', 'twitchId'], name: 'twitch_notify_guild_streamer' }, { fields: ['twitchId'] }],
            }
        );
        return this;
    }
}

module.exports = TwitchNotify;
