/* grace — removes stale Join-to-Create channels left over from before a restart. */
const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    const { sweepGuild } = require('./voiceStateUpdate');
    for (const guild of client.guilds.cache.values()) await sweepGuild(guild);
  },
};
