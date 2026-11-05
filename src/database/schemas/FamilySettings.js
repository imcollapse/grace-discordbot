// Family system — per-user switches for receiving marriage proposals / adoption offers.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class FamilySettings extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                userId:    { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                proposals: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
                adoptions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            },
            { sequelize, modelName: 'FamilySettings', tableName: 'family_settings', timestamps: false }
        );
        return this;
    }
}

module.exports = FamilySettings;
