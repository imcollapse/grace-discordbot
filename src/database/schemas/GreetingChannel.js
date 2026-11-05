// Premium — extra welcome channels. Each one has its own message and its own auto-delete.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class GreetingChannel extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                guildId:    { type: DataTypes.STRING, allowNull: false },
                kind:       { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'welcome' },
                channelId:  { type: DataTypes.STRING, allowNull: false },
                message:    { type: DataTypes.TEXT, allowNull: false },          // may hold {embed:name} / {container:name}
                autoDelete: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },   // seconds, 0 = keep
            },
            {
                sequelize,
                modelName: 'GreetingChannel',
                tableName: 'greeting_channels',
                timestamps: true,
                indexes: [{ unique: true, fields: ['guildId', 'kind', 'channelId'], name: 'greeting_channels_unique' }],
            }
        );
        return this;
    }
}

module.exports = GreetingChannel;
