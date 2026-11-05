/**
 * @file tracking.js
 * @developer cosmin
 */

module.exports = {
    name: 'tracking',
    description: 'Show tracking commands',
    aliases: [],
    async execute(message, args) {
        if (!args || !args.length) {
            return require('../../services/helpMenu').sendHelp('tracking', message);
        }
        return require('../../services/helpMenu').sendHelp('tracking', message);
    }
};
