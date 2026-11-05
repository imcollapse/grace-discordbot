// grace — unjail @user  (same as: jail release @user)

module.exports = {
    name: 'unjail',
    description: 'Let a jailed member out and give their roles back',
    aliases: [],
    usage: 'unjail <user>',
    category: 'moderation',
    async execute(message, args = []) {
        if (!message.guild) return;
        return require('./jail').release(message, args);
    },
};
