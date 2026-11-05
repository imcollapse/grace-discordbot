// Premium passes that are not a whole server plan.
//   kind 'user'      → perks that follow a person (family size, economy bonus, ...)
//   kind 'branding'  → the per-server bot profile (avatar, banner, bio) for one server
//   expiresAt null = never expires.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class PremiumPass extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                kind:       { type: DataTypes.STRING(10), allowNull: false },
                targetId:   { type: DataTypes.STRING, allowNull: false },          // user id, or server id for branding
                targetName: { type: DataTypes.STRING, allowNull: true },
                grantedBy:  { type: DataTypes.STRING, allowNull: true },
                startedAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
                expiresAt:  { type: DataTypes.DATE, allowNull: true },
            },
            {
                sequelize,
                modelName: 'PremiumPass',
                tableName: 'premium_passes',
                timestamps: true,
                indexes: [{ unique: true, fields: ['kind', 'targetId'] }, { fields: ['expiresAt'] }],
            }
        );
        return this;
    }
}

module.exports = PremiumPass;
