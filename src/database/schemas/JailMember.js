// Jail — who is jailed, with the roles to give back when they are let out.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class JailMember extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                guildId:     { type: DataTypes.STRING, allowNull: false },
                userId:      { type: DataTypes.STRING, allowNull: false },
                moderatorId: { type: DataTypes.STRING, allowNull: false },
                reason:      { type: DataTypes.TEXT, allowNull: true },
                roles:       { type: DataTypes.JSON, allowNull: false, defaultValue: [] },   // role ids taken away
                jailedAt:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
                expiresAt:   { type: DataTypes.DATE, allowNull: true },                      // null = until released
            },
            {
                sequelize, modelName: 'JailMember', tableName: 'jail_members', timestamps: false,
                indexes: [{ unique: true, fields: ['guildId', 'userId'], name: 'jail_members_guild_user' }, { fields: ['expiresAt'] }],
            }
        );
        return this;
    }
}

module.exports = JailMember;
