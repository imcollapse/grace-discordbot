// [dev] cosmin :: modules/dual/welcome/welcome.js

const { SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Manage server welcome message settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup welcome message for new members')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset all welcome settings')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('View current welcome configuration')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('addchannel')
                .setDescription('Premium: also welcome new members in another channel, with its own message')
                .addChannelOption(o => o.setName('channel').setDescription('Where to post').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
                .addStringOption(o => o.setName('message').setDescription('Text, supports variables, {embed:name} and {container:name}').setRequired(true).setMaxLength(2000))
                .addIntegerOption(o => o.setName('auto_delete').setDescription('Delete the message after…').addChoices(
                    { name: 'Keep the message', value: 0 }, { name: '5 seconds', value: 5 }, { name: '10 seconds', value: 10 },
                    { name: '30 seconds', value: 30 }, { name: '1 minute', value: 60 }, { name: '5 minutes', value: 300 }, { name: '10 minutes', value: 600 }))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('removechannel')
                .setDescription('Stop welcoming members in an extra channel')
                .addChannelOption(o => o.setName('channel').setDescription('The extra channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('channels')
                .setDescription('List the main and extra welcome channels')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Preview the welcome message using your profile')
        ),

    name: 'welcome',
    aliases: ['welcomer', 'greet'],
    usage: '(setup | config | test | reset | addchannel | removechannel | channels)',
    description: 'Manage server welcome message settings',

    async execute(interactionOrMessage, args = []) {
        const isSlash = interactionOrMessage.isCommand?.();
        let subcommand;

        if (isSlash) {
            subcommand = interactionOrMessage.options.getSubcommand();
        } else {
            subcommand = args[0]?.toLowerCase();
            args = args.slice(1);
        }

        const greeter = require('../../../services/greeter');
        const extra = require('../../../services/welcomeChannels');
        if (subcommand === 'addchannel') {
            if (!interactionOrMessage.guild) return;
            if (isSlash) {
                const o = interactionOrMessage.options;
                return extra.add(interactionOrMessage, { channel: o.getChannel('channel'), message: o.getString('message'), autoDelete: o.getInteger('auto_delete') ?? 0 });
            }
            return extra.add(interactionOrMessage, extra.parsePrefix(interactionOrMessage, args));
        }
        if (subcommand === 'removechannel') {
            const ch = isSlash ? interactionOrMessage.options.getChannel('channel')
                : (interactionOrMessage.mentions.channels?.first?.() || interactionOrMessage.guild.channels.cache.get((args[0] || '').replace(/\D/g, '')));
            return extra.remove(interactionOrMessage, ch);
        }
        const tip = () => require('../../../services/premium/views').nudge(interactionOrMessage, {
            plan: 'server', topic: 'welcome',
            line: `**Free servers get one welcome channel.**\n> Server Premium adds up to **${require('../../../services/premium').perks.welcomeChannels.premium}** more, each with its own message and auto-delete.`,
        });
        if (subcommand === 'channels') { const r = await extra.list(interactionOrMessage); await tip(); return r; }

        // setup / config (and no subcommand at all) open the panel
        if (!subcommand || subcommand === 'setup' || subcommand === 'config') { const r = await greeter.openPanel(interactionOrMessage, 'welcome'); await tip(); return r; }
        if (subcommand === 'test') return greeter.sendTest(interactionOrMessage, 'welcome');
        if (subcommand === 'reset') return greeter.openReset(interactionOrMessage, 'welcome');
        return greeter.openPanel(interactionOrMessage, 'welcome');
    }
};
