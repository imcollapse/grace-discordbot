// ─── cosmin · developer ───

const ui = require('../../../services/ui');
const restart = require('../../../services/restart');
const config = require('../../../settings');

module.exports = {
    name: 'reboot',
    description: 'Restart the bot process',
    aliases: ['restart'],
    ownerOnly: true,

    async execute(message) {
        if (message.author.id !== config.OWNER_ID) return;

        const card = ui.box('warning')
            .addTextDisplayComponents(ui.text('### Rebooting'))
            .addTextDisplayComponents(ui.text(ui.sub('shutting down and starting fresh · back in a few seconds')));

        const sent = await ui.send(message, card);
        await restart.perform(message.client, { channelId: message.channel.id, messageId: sent?.id, userId: message.author.id });
    },
};
