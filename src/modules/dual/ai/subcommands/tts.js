const ui = require('../../../../services/ui');
const { runSpeech } = require('../../../../services/aiCard');
const { SPEAKERS, LANGS, LANG_NAMES, hasSpeech } = require('../../../../services/aiProvider');
const { repliedText } = require('./util');

module.exports = {
    async execute(ctx, args = []) {
        const isSlash = !!ctx.isChatInputCommand?.();
        let text, speaker, lang;

        if (isSlash) {
            text = ctx.options.getString('text');
            speaker = ctx.options.getString('voice') || undefined;
            lang = ctx.options.getString('language') || undefined;
        } else {
            // `ai tts [language] [voice] <text>`  e.g.  ai tts hindi priya namaste dost
            while (args.length) {
                const w = args[0].toLowerCase();
                if (!lang && (LANGS[w] || LANG_NAMES[w])) lang = LANGS[w] ? w : LANG_NAMES[w];
                else if (!speaker && SPEAKERS.includes(w)) speaker = w;
                else break;
                args = args.slice(1);
            }
            text = args.join(' ');
            if (!text.trim()) text = await repliedText(ctx);
        }

        text = (text || '').trim();
        if (!text) return ui.say.warning(ctx, 'Give me text to speak: `ai tts [language] [voice] <text>`\nLanguages: ' + Object.entries(LANGS).map(([k, [, n]]) => `${n} (${k})`).join(', ') + '\nVoices: ' + SPEAKERS.join(', '));
        if (!hasSpeech()) return ui.say.error(ctx, 'Speech is not set up on this bot yet.');
        return runSpeech(ctx, text.slice(0, 2500), { speaker, lang });
    },
};
