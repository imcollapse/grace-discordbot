// Captcha verification — members who joined and have not passed yet.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class VerifyPending extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                guildId:   { type: DataTypes.STRING, allowNull: false },
                userId:    { type: DataTypes.STRING, allowNull: false },
                channelId: { type: DataTypes.STRING, allowNull: true },    // where the ping was posted
                messageId: { type: DataTypes.STRING, allowNull: true },
                joinedAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            },
            {
                sequelize, modelName: 'VerifyPending', tableName: 'verify_pending', timestamps: false,
                indexes: [{ unique: true, fields: ['guildId', 'userId'], name: 'verify_pending_guild_user' }, { fields: ['joinedAt'] }],
            }
        );
        return this;
    }
}

module.exports = VerifyPending;
