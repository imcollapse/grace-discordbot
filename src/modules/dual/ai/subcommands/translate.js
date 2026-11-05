const ui = require('../../../../services/ui');
const { runChat } = require('../../../../services/aiCard');
const { repliedText } = require('./util');

module.exports = {
    async execute(ctx, args = []) {
        const isSlash = !!ctx.isChatInputCommand?.();
        let language, text;
        if (isSlash) {
            language = ctx.options.getString('language');
            text = ctx.options.getString('text');
        } else {
            language = args[0];
            text = args.slice(1).join(' ');
            if (!text.trim()) text = await repliedText(ctx);
        }
        if (!language || !text?.trim()) return ui.say.warning(ctx, 'Use `ai translate <language> <text>`, or reply to a message with `ai translate <language>`.');

        const system = `You are a translator. Translate the user's text into ${language.slice(0, 40)}. Reply with the translation only, no notes.`;
        return runChat(ctx, text.trim().slice(0, 1500), { system, convo: [], remember: false, title: `Translate to ${language.slice(0, 40)}` });
    },
};
