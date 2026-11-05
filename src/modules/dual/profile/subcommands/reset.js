/**
 * @file reset.js
 * @developer cosmin
 */

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} = require('discord.js');
const Profile = require('../../../../database/schemas/Profile');
const emojis = require('../../../../media/emojis.json');

module.exports = {
    async execute(interactionOrMessage, args = []) {
        const userId = interactionOrMessage.user?.id || interactionOrMessage.author.id;

        try {
            const reset = await Profile.resetProfile(userId);
            const hadCard = await require('../../../../database/profileCards').clear(userId).then((r) => r.changes > 0).catch(() => false);

            if (!reset && !hadCard) {
                const container = new ContainerBuilder().setAccentColor(0xED4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.error} You don't have any profile data to reset.`)
                    );

                return interactionOrMessage.reply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            const successContainer = new ContainerBuilder().setAccentColor(0x57F287)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.success} Your profile has been reset. Your card, description, socials and background are cleared.`)
                );

            await interactionOrMessage.reply({
                components: [successContainer],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (error) {
            console.error('Profile reset error:', error);
            
            const errorContainer = new ContainerBuilder().setAccentColor(0x2B2D31)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# Database Error')
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        'Failed to reset your profile. Please try again later.'
                    )
                );

            await interactionOrMessage.reply({
                components: [errorContainer],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};
