// »» engineered by cosmin ««
// grace · ,feedback  setup · panel · stats · config · reset   (also /feedback)

const F = require('../../services/feedback');

module.exports = {
    name: 'feedback',
    description: 'Collect star reviews from your members',
    aliases: ['review', 'reviews'],
    async execute(message, args) {
        const sub = (args[0] || '').toLowerCase();
        if (!sub) return require('../../services/helpMenu').sendHelp('feedback', message);
        return F.run(message, sub);
    },
};
