// Join DM — the message every new member gets in their DMs.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class JoinDm extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                guildId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
                message: { type: DataTypes.TEXT, allowNull: true },     // text, may hold {embed:name} / {container:name}
                link:    { type: DataTypes.STRING(300), allowNull: true },   // button target (an invite); the server itself when empty
                sent:    { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
                failed:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            },
            { sequelize, modelName: 'JoinDm', tableName: 'join_dm', timestamps: true }
        );
        return this;
    }
}

module.exports = JoinDm;
