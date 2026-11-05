// Captcha verification — per-server setup.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class VerifyConfig extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                guildId:    { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                enabled:    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
                channelId:  { type: DataTypes.STRING, allowNull: true },    // where new members are pinged
                roleId:     { type: DataTypes.STRING, allowNull: true },    // "Unverified": hidden from every channel but the verify one
                verifiedId: { type: DataTypes.STRING, allowNull: true },    // optional role handed out after passing
                logId:      { type: DataTypes.STRING, allowNull: true },
                attempts:   { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
                kickAfter:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },   // minutes, 0 = never
                length:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
                message:    { type: DataTypes.TEXT, allowNull: true },      // text on the verify panel
                panelId:    { type: DataTypes.STRING, allowNull: true },    // message id of the posted panel
                verified:   { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
                failed:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            },
            { sequelize, modelName: 'VerifyConfig', tableName: 'verify_config', timestamps: true }
        );
        return this;
    }
}

module.exports = VerifyConfig;
