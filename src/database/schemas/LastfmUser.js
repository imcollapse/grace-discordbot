// Last.fm: which Last.fm account a Discord user linked.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class LastfmUser extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                userId:     { type: DataTypes.STRING, primaryKey: true, allowNull: false },
                username:   { type: DataTypes.STRING, allowNull: false },
                sessionKey: { type: DataTypes.STRING, allowNull: true },    // only after `lastfm login`; lets the bot love/unlove for them
            },
            { sequelize, modelName: 'LastfmUser', tableName: 'lastfm_users', timestamps: true, indexes: [{ fields: ['username'] }] }
        );
        return this;
    }
}

module.exports = LastfmUser;
