// grace · routes the buttons of /play games (custom ids start with "gm:").

function init(client) {
    client.on('interactionCreate', (interaction) => {
        if (interaction.isButton() && interaction.customId.startsWith('gm:')) require('../services/games').handle(interaction);
    });
}

module.exports = { init };
