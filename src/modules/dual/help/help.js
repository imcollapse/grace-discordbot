/* ---
   author : cosmin
   module : help
   --- */

const { SlashCommandBuilder } = require('discord.js');
const ui = require('../../../services/ui');
const i18n = require('../../../localization');
const { showHelp, showSimpleHelp, showCommand, resolveCategory, registry, CATEGORIES } = require('../../../services/helpMenu');

/** Everything /help query can autocomplete: the dropdown categories, then every command. */
let suggestions;
function allSuggestions() {
    if (suggestions) return suggestions;
    const seen = new Set();
    const out = [];
    const add = (name, value) => {
        const key = value.toLowerCase();
        if (seen.has(key) || name.length > 100 || value.length > 100) return;
        seen.add(key);
        out.push({ name, value });
    };

    const en = i18n.translatorFor('en');
    for (const cat of CATEGORIES) add(en(`help.cat.${cat.key}.label`), cat.key);
    for (const [key, mod] of Object.entries(registry)) {
        if (mod.commands?.length) add(`${key} (module)`, key);
    }

    for (const cat of CATEGORIES) {
        for (const [regKey, prefix] of cat.from) {
            for (const c of registry[regKey]?.commands || []) {
                const cmd = (prefix + c.name).replace(/\s*[<\[].*$/, '').trim();
                if (cmd) add(cmd, cmd);
            }
        }
    }
    return (suggestions = out);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Browse my commands')
        .setDescriptionLocalizations(i18n.descriptionLocalizations('slash.help'))
        .addStringOption(option =>
            option.setName('query')
                .setDescription('A category or command (e.g. antinuke, ban)')
                .setRequired(false)
                .setAutocomplete(true)
        ),

    name: 'help',
    description: 'Browse my commands',
    aliases: ['h'],
    category: 'information',

    async autocomplete(interaction) {
        const q = interaction.options.getFocused().toLowerCase().trim();
        const rank = (s) => (s.name.toLowerCase() === q ? 0 : s.name.toLowerCase().startsWith(q) ? 1 : 2);
        const list = allSuggestions()
            .filter(s => !q || s.name.toLowerCase().includes(q))
            .sort((a, b) => rank(a) - rank(b));
        await interaction.respond(list.slice(0, 25));
    },

    async execute(ctx, args = []) {
        const isSlash = ctx.isChatInputCommand?.();
        const query = (isSlash ? ctx.options.getString('query') : args.join(' '))?.trim();

        if (!query) return showSimpleHelp(ctx);

        // every query gets the reference card (command, group, module or category).
        // The category menu only opens for a plain `help`.
        if (await showCommand(ctx, query)) return;

        return ui.say.error(ctx, i18n.translator(ctx, 'help')('help.notFound', { query: query.slice(0, 40) }));
    }
};
