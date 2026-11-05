// New-post alerts: one row per (server, platform, account).

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class SocialFeed extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                guildId:    { type: DataTypes.STRING, allowNull: false },
                channelId:  { type: DataTypes.STRING, allowNull: false },
                platform:   { type: DataTypes.STRING(20), allowNull: false },        // youtube | reddit | instagram | tiktok | twitter
                accountKey: { type: DataTypes.STRING, allowNull: false },            // youtube channel id, subreddit, username
                name:       { type: DataTypes.STRING, allowNull: false },
                url:        { type: DataTypes.STRING(300), allowNull: true },
                avatar:     { type: DataTypes.STRING(500), allowNull: true },
                roleId:     { type: DataTypes.STRING, allowNull: true },
                lastId:     { type: DataTypes.STRING, allowNull: true },
                lastAt:     { type: DataTypes.BIGINT, allowNull: true },              // ms timestamp of the newest post already announced
                addedBy:    { type: DataTypes.STRING, allowNull: true },
            },
            {
                sequelize, modelName: 'SocialFeed', tableName: 'social_feeds', timestamps: true,
                indexes: [{ unique: true, fields: ['guildId', 'platform', 'accountKey'], name: 'social_feeds_unique' }, { fields: ['platform', 'accountKey'] }],
            }
        );
        return this;
    }
}

module.exports = SocialFeed;
