// grace · ,ai <prompt|imagine|tts|analyse|translate|summarize|enable|disable|clear>  ·  /ai

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const provider = require('../../../services/aiProvider');
const ui = require('../../../services/ui');

const sub = (name) => require(`./subcommands/${name}.js`);

const VOICE_CHOICES = provider.SPEAKERS.map(v => ({ name: v[0].toUpperCase() + v.slice(1), value: v }));
const LANG_CHOICES = Object.entries(provider.LANGS).map(([k, [, n]]) => ({ name: n, value: k }));

// words people type after `ai` → subcommand file
const WORDS = {
    prompt: 'prompt', ask: 'prompt', chat: 'prompt', say: 'prompt',
    imagine: 'imagine', image: 'imagine', img: 'imagine', draw: 'imagine', generate: 'imagine',
    tts: 'tts', speak: 'tts',
    analyse: 'analyse', analyze: 'analyse', vision: 'analyse', describe: 'analyse',
    translate: 'translate', tr: 'translate',
    summarize: 'summarize', summarise: 'summarize', summary: 'summarize', tldr: 'summarize',
    enable: 'enable', disable: 'disable', clear: 'clear', reset: 'clear',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Chat, make images, speak, translate and more with AI')
        .addSubcommand(s => s.setName('prompt').setDescription('Ask the AI anything')
            .addStringOption(o => o.setName('prompt').setDescription('Your message').setRequired(true).setMaxLength(1500)))
        .addSubcommand(s => s.setName('imagine').setDescription('Generate an image')
            .addStringOption(o => o.setName('prompt').setDescription('What to draw').setRequired(true).setMaxLength(500))
            .addStringOption(o => o.setName('shape').setDescription('Image shape')
                .addChoices({ name: 'Square', value: 'square' }, { name: 'Landscape', value: 'landscape' }, { name: 'Portrait', value: 'portrait' }))
            .addStringOption(o => o.setName('model').setDescription('Image model')
                .addChoices({ name: 'FLUX.1 (best, square)', value: 'flux' }, { name: 'SDXL (any shape)', value: 'sdxl' }, { name: 'Pollinations', value: 'pollinations' })))
        .addSubcommand(s => s.setName('tts').setDescription('Turn text into speech')
            .addStringOption(o => o.setName('text').setDescription('What to say').setRequired(true).setMaxLength(2500))
            .addStringOption(o => o.setName('voice').setDescription('Voice').addChoices(...VOICE_CHOICES))
            .addStringOption(o => o.setName('language').setDescription('Language (detected from the text by default)').addChoices(...LANG_CHOICES)))
        .addSubcommand(s => s.setName('analyse').setDescription('Look at an image and answer questions about it')
            .addAttachmentOption(o => o.setName('image').setDescription('The image').setRequired(true))
            .addStringOption(o => o.setName('prompt').setDescription('What do you want to know?').setMaxLength(500)))
        .addSubcommand(s => s.setName('translate').setDescription('Translate text')
            .addStringOption(o => o.setName('language').setDescription('Target language, e.g. Spanish').setRequired(true).setMaxLength(40))
            .addStringOption(o => o.setName('text').setDescription('Text to translate').setRequired(true).setMaxLength(1500)))
        .addSubcommand(s => s.setName('summarize').setDescription('Summarize a text')
            .addStringOption(o => o.setName('text').setDescription('Text to summarize').setRequired(true).setMaxLength(4000)))
        .addSubcommand(s => s.setName('enable').setDescription('Let the AI answer every message in this channel'))
        .addSubcommand(s => s.setName('disable').setDescription('Stop the AI answering in this channel'))
        .addSubcommand(s => s.setName('clear').setDescription('Forget our conversation in this channel')),

    name: 'ai',
    aliases: ['ask'],
    description: 'Chat, make images, speak, translate and more with AI',
    category: 'ai',

    async execute(ctx, args = []) {
        const isSlash = !!ctx.isChatInputCommand?.();

        let name;
        if (isSlash) {
            name = ctx.options.getSubcommand();
            // slow work: acknowledge now, edit later
            if (!['enable', 'disable', 'clear'].includes(name)) await ctx.deferReply();
        } else {
            const word = (args[0] || '').toLowerCase();
            if (!args.length) return require('../../../services/helpMenu').showCommand(ctx, 'ai');
            if (WORDS[word]) { name = WORDS[word]; args = args.slice(1); }
            else name = 'prompt';
        }

        try {
            return await sub(name).execute(ctx, args);
        } catch (err) {
            console.error(`[ai ${name}]`, err);
            const body = ui.fail('Something went wrong with the AI. Try again in a moment.');
            if (isSlash) return (ctx.deferred || ctx.replied ? ctx.editReply({ components: [body], flags: MessageFlags.IsComponentsV2 }) : ctx.reply({ components: [body], flags: MessageFlags.IsComponentsV2 })).catch(() => {});
            return ui.send(ctx, body).catch(() => {});
        }
    },
};
