const offers = require('../../../../services/family/offers');

module.exports = {
    async execute(w) {
        const [target] = await w.users(['user']);
        if (!target) return w.say('warn', 'Who?', 'Mention the person you want to marry: `/family marry user:@someone`');
        if (target.bot) return w.say('bad', 'Bots can\'t say yes', 'Pick a human.');
        return offers.start(w, { kind: 'marry', target });
    },
};
