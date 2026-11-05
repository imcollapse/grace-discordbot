const ui = require('../../../../services/ui');
const { runChat } = require('../../../../services/aiCard');
const { repliedText } = require('./util');

module.exports = {
    async execute(ctx, args = []) {
        const isSlash = !!ctx.isChatInputCommand?.();
        let text = isSlash ? ctx.options.getString('text') : args.join(' ');
        if (!text?.trim()) text = await repliedText(ctx);
        if (!text?.trim()) return ui.say.warning(ctx, 'Use `ai summarize <text>`, or reply to a message with `ai summarize`.');

        const system = 'Summarize the user\'s text in a few short bullet points. Keep the key facts, drop the filler. Reply with the summary only.';
        return runChat(ctx, text.trim().slice(0, 4000), { system, convo: [], remember: false, title: 'Summary' });
    },
};
