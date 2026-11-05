const ui = require('../../../../services/ui');
const { clearUserHistory } = require('../../../../database/aiHistory');

module.exports = {
    async execute(ctx) {
        const user = ctx.user ?? ctx.author;
        await clearUserHistory(user.id);
        return ui.say.success(ctx, 'I forgot our conversation.');
    },
};
