// grace — honeypot: watch the trap channel.

const { Events } = require('discord.js');
const H = require('../services/honeypot');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        try { await H.handle(message); } catch (e) { console.error('[honeypot]', e.message); }
    },
};
