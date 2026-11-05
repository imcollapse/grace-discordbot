// Premium — one row per server that has (or had) premium.
//   source: 'trial' (the free 3-day trial) or 'grant' (given by the bot owner)
//   expiresAt: null = never expires. After a lapse the row stays, so a trial can't be started twice.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class PremiumGuild extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                guildId:     { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                guildName:   { type: DataTypes.STRING, allowNull: true },
                ownerId:     { type: DataTypes.STRING, allowNull: false },       // server owner when it was granted
                source:      { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'grant' },
                trialUsed:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
                grantedBy:   { type: DataTypes.STRING, allowNull: true },
                startedAt:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
                expiresAt:   { type: DataTypes.DATE, allowNull: true },
                endNotified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            },
            {
                sequelize,
                modelName: 'PremiumGuild',
                tableName: 'premium_guilds',
                timestamps: true,
                indexes: [{ fields: ['ownerId'] }, { fields: ['expiresAt'] }],
            }
        );
        return this;
    }
}

module.exports = PremiumGuild;
