// grace · ,image <effect> — change a picture
//   image                       the list of effects
//   image grayscale             effect on the attached image, the image you replied to, a mentioned member's avatar, or yours
//   image blur 12               effects take an optional amount
//   image caption top|bottom    meme text
//   image removebg              cut out the background (needs a remove.bg key)

const { MessageFlags, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const ui = require('../../services/ui');
const { FX, fit, names } = require('../../services/imageFx');
const provider = require('../../services/aiProvider');
const emojis = require('../../media/emojis.json');

const V2 = MessageFlags.IsComponentsV2;
const MAX_BYTES = 10 * 1024 * 1024;
const URL_RE = /^https?:\/\/\S+$/i;
const isImg = (a) => !!a && (a.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name ?? a.url ?? ''));

/** Where is the picture? @returns { url, rest } with `rest` = the arguments left over */
async function findSource(message, args) {
  const att = message.attachments.first();
  if (isImg(att)) return { url: att.url, rest: args };

  const ref = message.reference?.messageId ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null) : null;
  if (ref) {
    const ra = ref.attachments.find(isImg);
    if (ra) return { url: ra.url, rest: args };
    const emb = ref.embeds.find(e => e.image?.url || e.thumbnail?.url);
    if (emb) return { url: emb.image?.url || emb.thumbnail.url, rest: args };
    if (ref.stickers?.first()) return { url: ref.stickers.first().url, rest: args };
  }

  const idx = args.findIndex(a => URL_RE.test(a));
  if (idx >= 0) return { url: args[idx], rest: args.filter((_, i) => i !== idx) };

  const mentioned = message.mentions.users.first();
  if (mentioned) return { url: mentioned.displayAvatarURL({ extension: 'png', size: 1024 }), rest: args.filter(a => !/^<@!?\d+>$/.test(a)) };
  return { url: message.author.displayAvatarURL({ extension: 'png', size: 1024 }), rest: args };
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('download');
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('big');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('big');
  return buf;
}

const list = () => ui.box('base')
  .addTextDisplayComponents(ui.text('### Image tools\nUse `image <effect> [amount]` on an attachment, a replied image, a mentioned member or yourself.'))
  .addSeparatorComponents(ui.sep(false))
  .addTextDisplayComponents(ui.text(names().map(n => `\`${n}${FX[n].arg ? ` [${FX[n].arg}]` : ''}\`  ${FX[n].help}`).join('\n') +
    `\n\`removebg\`  Cut out the background${provider.hasRemoveBg() ? '' : ' (not set up)'}`));

module.exports = {
  name: 'image',
  description: 'Edit pictures: grayscale, blur, pixelate, caption, circle crop and more',
  aliases: ['img'],
  usage: 'image <effect> [amount] [image]',
  category: 'general',

  async execute(message, args = []) {
    const effect = (args[0] || '').toLowerCase();
    const send = (c, extra = {}) => message.reply({ components: [c].flat(), flags: V2, allowedMentions: { parse: [] }, ...extra });
    if (!effect || effect === 'list' || effect === 'help') return send(list());

    const fx = FX[effect];
    if (!fx && effect !== 'removebg') return send(ui.warn(`There is no effect called \`${effect.slice(0, 20)}\`. Use \`image\` to see the list.`));
    if (effect === 'removebg' && !provider.hasRemoveBg()) return send(ui.fail('Background removal is not set up on this bot yet.'));

    const wait = await send(ui.box('base').addTextDisplayComponents(ui.text(`${emojis.loading} Working on it...`))).catch(() => null);
    const edit = (c, extra = {}) => (wait ? wait.edit({ content: null, components: [c].flat(), flags: V2, allowedMentions: { parse: [] }, ...extra }) : send(c, extra));
    const started = Date.now();

    try {
      const { url, rest } = await findSource(message, args.slice(1));
      const raw = await download(url);
      let out, name = 'edited.png';

      if (effect === 'removebg') {
        const r = await provider.removeBackground(raw);
        if (!r.success) return edit(ui.fail(r.error));
        out = r.buffer;
      } else {
        const img = await loadImage(raw);
        const arg = rest.join(' ').trim();
        if (effect === 'caption' && !arg) return edit(ui.warn('Add the text: `image caption top text|bottom text`'));
        const canvas = fx.run(fit(img), arg || undefined);
        out = canvas.toBuffer('image/png');
        if (out.length > 8 * 1024 * 1024) return edit(ui.fail('The result is too big to send. Try a smaller image.'));
      }

      const box = ui.box('base')
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`)))
        .addTextDisplayComponents(ui.text(ui.sub(`${effect} • took ${((Date.now() - started) / 1000).toFixed(1)}s • requested by ${message.author.username}`)));
      return edit(box, { files: [new AttachmentBuilder(out, { name })], attachments: [] });
    } catch (e) {
      const msg = e.message === 'big' ? 'That image is too big. The limit is 10 MB.' : e.message === 'download' ? 'I couldn\'t download that image.' : 'I couldn\'t read that as an image.';
      return edit(ui.fail(msg));
    }
  },
};
