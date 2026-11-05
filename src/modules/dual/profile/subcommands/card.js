// ▛▀ cosmin ▀▜

const emojis = require('../../../../media/emojis.json');

module.exports = {
    async execute(interactionOrMessage, args = []) {
        const isSlashCommand = interactionOrMessage.isCommand && interactionOrMessage.isCommand();

        let targetUser;
        let reply;

        if (isSlashCommand) {
            await interactionOrMessage.deferReply();
            targetUser = interactionOrMessage.options.getUser('user') || interactionOrMessage.user;
            reply = (content) => interactionOrMessage.editReply(content);
        } else {
            const thinkingMsg = await interactionOrMessage.reply(`${emojis.loading} Loading profile card...`);
            const mentionedUser = interactionOrMessage.mentions.users.first();
            targetUser = mentionedUser || interactionOrMessage.author;
            reply = (content) => thinkingMsg.edit({ content: null, ...content });
        }

        try {
            targetUser = await targetUser.fetch(true);
        } catch {}

        let presenceStatus = 'offline';
        try {
            const guild = interactionOrMessage.guild;
            if (guild) {
                const member = await guild.members.fetch(targetUser.id);
                presenceStatus = member?.presence?.status || 'offline';
            }
        } catch {}

        try {
            await reply(await require('../../../../services/profileView').image(interactionOrMessage.client, interactionOrMessage.guild, targetUser, presenceStatus));
        } catch (error) {
            console.error('[Profile Card] Error generating profile card:', error);
            return reply({ content: 'Error generating profile card. Please try again.' });
        }
    }
};
