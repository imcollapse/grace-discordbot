// grace · /tools: the small personal tools as one slash command, so they work in DMs and on a user install.
// (A bot can't read prefix messages in someone else's DMs, only slash commands reach it there.)

const { SlashCommandBuilder } = require('discord.js');
const { H, META } = require('../../services/me/tools');

// slash name -> handler key, and whether the one text option is required
const SUBS = {
    choose:    { key: 'choose',    req: true,  opt: 'options', hint: 'Options split with | like pizza | sushi' },
    roll:      { key: 'roll',      req: false, opt: 'dice',    hint: 'Like 2d6 or d20' },
    '8ball':   { key: 'eightball', req: true,  opt: 'question', hint: 'Your question' },
    timestamp: { key: 'timestamp', req: false, opt: 'time',    hint: 'Like 2h, 2026-12-25 18:00 or a unix number' },
    color:     { key: 'color',     req: false, opt: 'colour',  hint: 'Like #ff8800 or 255 136 0, empty for random' },
    password:  { key: 'password',  req: false, opt: 'length',  hint: '8 to 64, default 16' },
    qr:        { key: 'qr',        req: true,  opt: 'text',    hint: 'Text or a link' },
    weather:   { key: 'weather',   req: true,  opt: 'city',    hint: 'City name' },
    time:      { key: 'worldtime', req: true,  opt: 'place',   hint: 'City or timezone like Tokyo or Europe/London' },
    currency:  { key: 'currency',  req: true,  opt: 'convert', hint: 'Like 100 usd inr' },
    base64:    { key: 'base64',    req: true,  opt: 'text',    hint: 'encode or decode, then the text' },
    reverse:   { key: 'reverse',   req: true,  opt: 'text',    hint: 'Text to reverse' },
    snowflake: { key: 'snowflake', req: true,  opt: 'id',      hint: 'A Discord ID' },
    joke:      { key: 'joke',      req: null },
    advice:    { key: 'advice',    req: null },
    fact:      { key: 'fact',      req: null },
};

const data = new SlashCommandBuilder().setName('tools').setDescription('Small tools that work anywhere, even in DMs');
for (const [name, s] of Object.entries(SUBS)) {
    data.addSubcommand((c) => {
        c.setName(name).setDescription(META[s.key].description.slice(0, 100));
        if (s.req !== null) c.addStringOption((o) => o.setName(s.opt).setDescription(s.hint.slice(0, 100)).setRequired(s.req).setMaxLength(900));
        return c;
    });
}

module.exports = {
    data,
    async execute(interaction) {
        const name = interaction.options.getSubcommand();
        const s = SUBS[name];
        if (!s) return;
        await interaction.deferReply();
        const input = s.req === null ? '' : (interaction.options.getString(s.opt) || '');
        await H[s.key](interaction, input.split(/ +/).filter(Boolean));
    },
};
