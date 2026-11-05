// grace — family system (hybrid).
//   slash   /family marry|divorce|adopt|disown|runaway|profile|tree|relationship|proposals|adoptions|leave
//   prefix  ,family marry @user   ,fam tree   ,marry @user   ,adopt @user   ,divorce …
// Errors, confirmations and settings are ephemeral on slash (they self-delete on prefix).

const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');
const { Ctx, note } = require('../../../services/family/views');

const user = (o, desc, required = false) => o.setName('user').setDescription(desc).setRequired(required);

const SUBS = {
    marry: ['marry', 'propose'],
    divorce: ['divorce'],
    adopt: ['adopt'],
    disown: ['disown', 'kick'],
    runaway: ['runaway', 'run'],
    profile: ['profile', 'view', 'p'],
    tree: ['tree', 't'],
    relationship: ['relationship', 'rel', 'relation'],
    proposals: ['proposals', 'proposal'],
    adoptions: ['adoptions', 'adoption'],
    leave: ['leave'],
    help: ['help', 'commands'],
};
const lookup = Object.fromEntries(Object.entries(SUBS).flatMap(([k, names]) => names.map((n) => [n, k])));

// bare prefix commands: `,marry @user`
const BARE = ['marry', 'divorce', 'adopt', 'disown', 'runaway'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('family')
        .setDescription('Marriage, adoption and family trees')
        .addSubcommand((s) => s.setName('marry').setDescription('Propose to someone').addUserOption((o) => user(o, 'Who to propose to', true)))
        .addSubcommand((s) => s.setName('divorce').setDescription('End your marriage'))
        .addSubcommand((s) => s.setName('adopt').setDescription('Offer to adopt someone as your child').addUserOption((o) => user(o, 'Who to adopt', true)))
        .addSubcommand((s) => s.setName('disown').setDescription('Remove one of your children from your family').addUserOption((o) => user(o, 'Your child', true)))
        .addSubcommand((s) => s.setName('runaway').setDescription('Leave your parents'))
        .addSubcommand((s) => s.setName('profile').setDescription('Show a family profile card').addUserOption((o) => user(o, 'Whose profile (default: you)')))
        .addSubcommand((s) => s.setName('tree').setDescription('Draw a whole family as an image').addUserOption((o) => user(o, 'Whose family (default: yours)')))
        .addSubcommand((s) => s.setName('relationship').setDescription('How are two people related?')
            .addUserOption((o) => user(o, 'The first person', true))
            .addUserOption((o) => o.setName('user2').setDescription('The second person (default: you)')))
        .addSubcommand((s) => s.setName('proposals').setDescription('Choose whether people can propose to you')
            .addBooleanOption((o) => o.setName('enabled').setDescription('On or off (leave empty to see the current setting)')))
        .addSubcommand((s) => s.setName('adoptions').setDescription('Choose whether people can offer to adopt you')
            .addBooleanOption((o) => o.setName('enabled').setDescription('On or off (leave empty to see the current setting)')))
        .addSubcommand((s) => s.setName('leave').setDescription('Leave your whole family: spouse, children and parents')),

    name: 'family',
    description: 'Marriage, adoption and family trees',
    aliases: ['fam', ...BARE],
    category: 'fun',
    usage: '(marry | divorce | adopt | disown | runaway | profile | tree | relationship | proposals | adoptions | leave)',

    async execute(raw, args = []) {
        const w = new Ctx(raw, args);
        let sub;
        if (w.slash) sub = raw.options.getSubcommand();
        else {
            const used = (raw.invokedAs || '').split(' ')[0];
            if (BARE.includes(used)) {
                // no-prefix users: a plain word like "adopt a dog" must not trigger anything
                if (!raw.usedPrefix && !raw.mentions.users.size) return;
                sub = used;
            } else {
                const first = (args[0] || '').toLowerCase();
                sub = lookup[first] || (first ? 'help' : 'help');
                if (lookup[first]) w.args = args.slice(1);
                if (!first) sub = 'help';
            }
        }

        const file = path.join(__dirname, 'subcommands', `${sub}.js`);
        if (!fs.existsSync(file)) return w.reply(note('bad', 'Unknown family command', 'Try `family help`.'), { ephemeral: true });
        return require(file).execute(w);
    },
};
