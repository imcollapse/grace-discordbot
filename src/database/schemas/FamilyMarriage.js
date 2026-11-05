// Family system — one row per marriage (a user can only be in one).

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class FamilyMarriage extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                userA:     { type: DataTypes.STRING, allowNull: false, unique: true },
                userB:     { type: DataTypes.STRING, allowNull: false, unique: true },
                marriedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            },
            { sequelize, modelName: 'FamilyMarriage', tableName: 'family_marriages', timestamps: false }
        );
        return this;
    }
}

module.exports = FamilyMarriage;
