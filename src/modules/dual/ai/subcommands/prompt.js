const ui = require('../../../../services/ui');
const { runChat } = require('../../../../services/aiCard');
const { repliedText } = require('./util');

module.exports = {
    async execute(ctx, args = []) {
        const isSlash = !!ctx.isChatInputCommand?.();
        let prompt = (isSlash ? ctx.options.getString('prompt') : args.join(' ')).trim();
        if (!prompt) prompt = await repliedText(ctx);
        if (!prompt) return ui.say.warning(ctx, 'Tell me what to answer: `ai prompt <message>`');
        return runChat(ctx, prompt.slice(0, 1500));
    },
};
