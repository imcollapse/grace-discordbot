const { MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const ui = require('../../../../services/ui');
const provider = require('../../../../services/aiProvider');
const { processAiResponse } = require('../../../../services/aiUtils');
const { thinking, deliver, fail } = require('../../../../services/aiCard');
const { repliedMessage } = require('./util');

const OK = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const DEFAULT = 'Describe this image in detail.';

module.exports = {
    async execute(ctx, args = []) {
        const isSlash = !!ctx.isChatInputCommand?.();
        let att, prompt;

        if (isSlash) {
            att = ctx.options.getAttachment('image');
            prompt = ctx.options.getString('prompt') || DEFAULT;
        } else {
            prompt = args.join(' ').trim() || DEFAULT;
            att = ctx.attachments.first();
            if (!att) att = (await repliedMessage(ctx))?.attachments.first();
        }

        if (!att) return ui.say.warning(ctx, 'Attach an image, or reply to a message that has one.');
        if (!OK.includes(att.contentType)) return ui.say.warning(ctx, 'Send a PNG, JPG, GIF or WebP image.');

        const thinkMsg = isSlash ? null : await thinking(ctx, 'is looking').catch(() => null);

        const src = await fetch(att.url).catch(() => null);
        if (!src?.ok) return fail(thinkMsg, ctx, 'I couldn\'t download that image.');
        const dataUrl = `data:${att.contentType};base64,${Buffer.from(await src.arrayBuffer()).toString('base64')}`;
        const r = await provider.chat([{
            role: 'user',
            content: [
                { type: 'text', text: `You are ${ctx.client.user.username}. Look at this image and answer the request. Never mention other AI models or companies.\n\nRequest: ${prompt}` },
                { type: 'image_url', image_url: { url: dataUrl } },
            ],
        }], { maxTokens: 1024 });
        if (!r.success) return fail(thinkMsg, ctx, r.error);

        const text = processAiResponse(r.content).slice(0, 3200);
        const c = ui.box('base')
            .addTextDisplayComponents(ui.text(`## ${prompt === DEFAULT ? 'Image analysis' : prompt.slice(0, 120)}`))
            .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(att.url)))
            .addSeparatorComponents(ui.sep())
            .addTextDisplayComponents(ui.text(text))
            .addSeparatorComponents(ui.sep())
            .addTextDisplayComponents(ui.text(ui.sub(`${r.label} • took ${(r.ms / 1000).toFixed(1)}s • 1/1 • ${r.host}`)));
        return deliver(thinkMsg, ctx, c);
    },
};
