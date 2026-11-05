// Family system — one row per child. A child has one parent and an optional co-parent.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class FamilyChild extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                childId:    { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                parentId:   { type: DataTypes.STRING, allowNull: false },
                coParentId: { type: DataTypes.STRING, allowNull: true },
                adoptedAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            },
            {
                sequelize, modelName: 'FamilyChild', tableName: 'family_children', timestamps: false,
                indexes: [{ fields: ['parentId'] }, { fields: ['coParentId'] }],
            }
        );
        return this;
    }
}

module.exports = FamilyChild;
