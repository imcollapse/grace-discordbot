// Snapshot — per-server switch: may admins use snapshots too (default: owner only).

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class SnapshotSettings extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                guildId:     { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                allowAdmins: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            },
            { sequelize, modelName: 'SnapshotSettings', tableName: 'snapshot_settings', timestamps: false }
        );
        return this;
    }
}

module.exports = SnapshotSettings;
