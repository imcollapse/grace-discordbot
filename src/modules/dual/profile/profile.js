/** @author cosmin */

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    AttachmentBuilder
} = require('discord.js');
const path = require('path');
const { NoPrefix, Profile } = require('../../../database/schemas');
const { profileImage } = require('../../../services/profileCard');
const emojis = require('../../../media/emojis.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Manage your profile')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View a user\'s profile')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to view')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('description')
                .setDescription('Set your profile description')
                .addStringOption(option =>
                    option.setName('text')
                        .setDescription('Your profile description')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('social')
                .setDescription('Set your social media link')
                .addStringOption(option =>
                    option.setName('platform')
                        .setDescription('Social media platform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Facebook', value: 'Facebook' },
                            { name: 'Instagram', value: 'Instagram' },
                            { name: 'LinkedIn', value: 'LinkedIn' },
                            { name: 'SnapChat', value: 'Snapchat' },
                            { name: 'YouTube', value: 'YouTube' },
                            { name: 'Website', value: 'Website' },
                            { name: 'TikTok', value: 'Tiktok' },
                            { name: 'Telegram', value: 'Telegram' },
                            { name: 'Spotify', value: 'Spotify' },
                            { name: 'Twitter/X', value: 'Twitter' },
                            { name: 'Twitch', value: 'Twitch' }
                        )
                )
                .addStringOption(option =>
                    option.setName('link')
                        .setDescription('Your profile link')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('background')
                .setDescription('Set your profile card background')
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('Image URL for your background')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset your profile (clears description, socials, and background)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Design your own profile card')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('card')
                .setDescription('View a user\'s profile card image')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to view')
                        .setRequired(false)
                )
        ),

    name: 'profile',
    description: 'Manage your profile',
    usage: '[edit] | [view @user] | [description <text>] | [social <platform> <link>] | [background <url>] | [reset] | [card @user]',

    async execute(interactionOrMessage, args = []) {
        const isSlashCommand = interactionOrMessage.isCommand && interactionOrMessage.isCommand();

        let subcommandName;

        if (isSlashCommand) {
            subcommandName = interactionOrMessage.options.getSubcommand();
        } else {
            subcommandName = args[0]?.toLowerCase();
            if (!subcommandName || !['view', 'description', 'social', 'background', 'reset', 'card', 'edit', 'customize'].includes(subcommandName)) {
                subcommandName = 'view';
            } else {
                args = args.slice(1);
            }
        }

        if (subcommandName === 'description') {
            const subcommandsPath = path.join(__dirname, 'subcommands');
            const subcommand = require(path.join(subcommandsPath, 'description.js'));
            return subcommand.execute(interactionOrMessage, args);
        }

        if (subcommandName === 'social') {
            const subcommandsPath = path.join(__dirname, 'subcommands');
            const subcommand = require(path.join(subcommandsPath, 'social.js'));
            return subcommand.execute(interactionOrMessage, args);
        }

        if (subcommandName === 'background') {
            const subcommandsPath = path.join(__dirname, 'subcommands');
            const subcommand = require(path.join(subcommandsPath, 'background.js'));
            return subcommand.execute(interactionOrMessage, args);
        }

        if (subcommandName === 'reset') {
            const subcommandsPath = path.join(__dirname, 'subcommands');
            const subcommand = require(path.join(subcommandsPath, 'reset.js'));
            return subcommand.execute(interactionOrMessage, args);
        }

        if (subcommandName === 'edit' || subcommandName === 'customize') {
            return require('./subcommands/edit').execute(interactionOrMessage, args);
        }

        if (subcommandName === 'card') {
            const subcommandsPath = path.join(__dirname, 'subcommands');
            const subcommand = require(path.join(subcommandsPath, 'card.js'));
            return subcommand.execute(interactionOrMessage, args);
        }

        let targetUser;
        let reply;

        if (isSlashCommand) {
            await interactionOrMessage.deferReply();
            targetUser = interactionOrMessage.options.getUser('user') || interactionOrMessage.user;
            reply = (content) => interactionOrMessage.editReply(content);
        } else {
            const thinkingMsg = await interactionOrMessage.reply(`${emojis.loading} Loading profile...`);
            const mentionedUser = interactionOrMessage.mentions.users.first();
            targetUser = mentionedUser || interactionOrMessage.author;
            reply = (content) => thinkingMsg.edit({ content: null, ...content });
        }

        try {
            targetUser = await targetUser.fetch(true);
        } catch { }

        let presenceStatus = 'offline';
        try {
            const guild = interactionOrMessage.guild;
            if (guild) {
                const member = await guild.members.fetch(targetUser.id);
                presenceStatus = member?.presence?.status || 'offline';
            }
        } catch { }

        try {
            const out = await require('../../../services/profileView').view(interactionOrMessage.client, interactionOrMessage.guild, targetUser, presenceStatus);
            await reply(out);
        } catch (error) {
            console.error('[profile] view failed:', error);
            await reply({ content: 'I couldn\'t build that profile right now. Try again in a moment.' });
        }
    }
};
