/* ---
   author : cosmin
   module : uptime
   --- */

const i18n = require('../../../localization');

module.exports = {
    name: 'uptime',
    description: 'Check how long the bot has been online',
    aliases: ['up', 'online'],

    async execute(message) {
        const { client } = message;
        const tr = i18n.translator(message);

        const uptimeMs = client.uptime;
        const since = Math.floor((Date.now() - uptimeMs) / 1000);

        // plain message, no container
        await message.reply({
            content: tr('uptime.alive', { uptime: tr.duration(uptimeMs, { compact: true }), since: `<t:${since}:R>` }),
            allowedMentions: { parse: [], repliedUser: false },
        });
    },
};
