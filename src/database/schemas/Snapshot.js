// Snapshot — a saved copy of a server's structure. `data` is gzip + base64 (assets included).

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class Snapshot extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id:            { type: DataTypes.STRING(12), primaryKey: true, allowNull: false },   // the backup ID
                ownerId:       { type: DataTypes.STRING, allowNull: false },                         // user who made it
                sourceGuildId: { type: DataTypes.STRING, allowNull: false },
                sourceName:    { type: DataTypes.STRING, allowNull: true },
                name:          { type: DataTypes.STRING(60), allowNull: false },
                counts:        { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
                data:          { type: DataTypes.TEXT, allowNull: false },
            },
            { sequelize, modelName: 'Snapshot', tableName: 'snapshots', timestamps: true, indexes: [{ fields: ['ownerId'] }] }
        );
        return this;
    }
}

module.exports = Snapshot;
