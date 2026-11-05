// Music — 24/7 mode: the voice channel the bot should stay in, per server.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class Music247 extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                guildId:        { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                voiceChannelId: { type: DataTypes.STRING, allowNull: false },
                textChannelId:  { type: DataTypes.STRING, allowNull: true },
                setBy:          { type: DataTypes.STRING, allowNull: true },
            },
            { sequelize, modelName: 'Music247', tableName: 'music_247', timestamps: true }
        );
        return this;
    }
}

module.exports = Music247;
