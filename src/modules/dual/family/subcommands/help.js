const { note, panel, COLOR } = require('../../../../services/family/views');

const LINES = [
    ['marry <user>', 'Propose, and they accept or decline with a button'],
    ['divorce', 'End your marriage'],
    ['adopt <user>', 'Offer to adopt someone. Up to 5 children, 15 with User Premium'],
    ['disown <user>', 'Remove one of your children'],
    ['runaway', 'Leave your parents'],
    ['profile [user]', 'A card with partner, parents, children and stats'],
    ['tree [user]', 'The whole family as an image'],
    ['relationship <user> [user2]', 'How two people are related'],
    ['proposals [on/off]', 'Stop or allow marriage proposals'],
    ['adoptions [on/off]', 'Stop or allow adoption offers'],
    ['leave', 'Leave your whole family in one step'],
];

module.exports = {
    async execute(w) {
        const lines = [
            '### Family',
            'Marriage, adoption and family trees.',
            '',
            ...LINES.map(([c, d]) => `**\`/family ${c}\`**\n-# ${d}`),
            '',
            '-# Prefix works too: `family marry @user` · `marry @user` · `adopt @user`',
        ];
        return w.reply(panel({ lines, color: COLOR.rose }), { ephemeral: true });
    },
};
