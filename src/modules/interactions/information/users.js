//
//  Made with care by cosmin
//

const { SlashCommandBuilder, ContainerBuilder } = require("discord.js");
const ui = require('../../../services/ui');
const i18n = require('../../../localization');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("users")
    .setDescription("Show the total users and servers"),

  async execute(interaction) {
    const { client } = interaction;
    const tr = i18n.translator(interaction);
    const users = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
    const guilds = client.guilds.cache.size;

    // container without an accent colour
    const container = new ContainerBuilder().addTextDisplayComponents(
      ui.text(tr('users.serving', { users: require('../../../services/statsFormat').compact(users), servers: require('../../../services/statsFormat').compact(guilds) })),
    );
    await ui.send(interaction, container);
  },
};
