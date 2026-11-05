// @cosmin(cosmin) — users

const { ContainerBuilder } = require('discord.js');
const ui = require('../../../services/ui');
const i18n = require('../../../localization');

module.exports = {
  name: "users",
  description: "Show the total users and servers",
  aliases: [],

  async execute(message, args) {
    const { client } = message;
    const tr = i18n.translator(message);
    const users = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
    const guilds = client.guilds.cache.size;

    // container without an accent colour
    const container = new ContainerBuilder().addTextDisplayComponents(
      ui.text(tr('users.serving', { users: require('../../../services/statsFormat').compact(users), servers: require('../../../services/statsFormat').compact(guilds) })),
    );
    await ui.send(message, container);
  },
};
