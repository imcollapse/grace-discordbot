const ui = require('../../../../services/ui');
const { runImage } = require('../../../../services/aiCard');
const { IMAGE_MODELS, SHAPES, hasImages } = require('../../../../services/aiProvider');
const { repliedText } = require('./util');

module.exports = {
    async execute(ctx, args = []) {
        const isSlash = !!ctx.isChatInputCommand?.();
        let prompt, shape = 'square', model;

        if (isSlash) {
            prompt = ctx.options.getString('prompt');
            shape = ctx.options.getString('shape') || 'square';
            model = ctx.options.getString('model') || undefined;
        } else {
            // flags: --landscape --portrait --square --flux --sdxl --pollinations
            const rest = [];
            for (const a of args) {
                const f = a.toLowerCase().replace(/^--?/, '');
                if (/^--?/.test(a) && SHAPES[f]) shape = f;
                else if (/^--?/.test(a) && IMAGE_MODELS[f]) model = f;
                else rest.push(a);
            }
            prompt = rest.join(' ');
            if (!prompt.trim()) prompt = await repliedText(ctx);
        }

        prompt = (prompt || '').trim();
        if (!prompt) return ui.say.warning(ctx, 'Describe the image: `ai imagine <prompt>`');
        if (!hasImages()) return ui.say.error(ctx, 'Image generation is not set up on this bot yet.');
        return runImage(ctx, prompt.slice(0, 500), { model, shape });
    },
};
