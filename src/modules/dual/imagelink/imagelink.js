// grace — ,imagelink  ·  /imagelink
// Turns an uploaded image into a permanent link (Discord's own attachment links expire after a day).
// The image is re-hosted on catbox.moe; if that fails the Discord link is returned with a warning.
// Plain text reply: a short line, the link (Discord previews the image), and the link again in a code block to copy.

const D = require('discord.js');
const emojis = require('../../../media/emojis.json');

const MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|tiff?)$/i;
const HOST = process.env.IMGLINK_HOST || 'https://catbox.moe/user/api.php';

const tick = emojis.success ? `${emojis.success} ` : '';
const copyBlock = (url, head) => `${tick}${head}\n\n${url}\n\`\`\`\n${url}\n\`\`\``;

const isImage = (a) => !!a && (a.contentType?.startsWith('image/') || IMAGE_EXT.test(a.name ?? ''));

async function host(att) {
  const src = await fetch(att.url);
  if (!src.ok) throw new Error('download failed');
  const buf = Buffer.from(await src.arrayBuffer());

  const form = new FormData();
  form.append('reqtype', 'fileupload');
  if (process.env.CATBOX_USERHASH) form.append('userhash', process.env.CATBOX_USERHASH);
  form.append('fileToUpload', new Blob([buf], { type: att.contentType || 'application/octet-stream' }), att.name || 'image.png');

  const res = await fetch(HOST, { method: 'POST', body: form, headers: { 'User-Agent': 'grace-discord-bot' }, signal: AbortSignal.timeout(60000) });
  const out = (await res.text()).trim();
  if (!res.ok || !/^https:\/\/files\.catbox\.moe\/\S+$/.test(out)) throw new Error(out.slice(0, 100) || `host error ${res.status}`);
  return out;
}

module.exports = {
  data: new D.SlashCommandBuilder()
    .setName('imagelink')
    .setDescription('Upload an image and get a link you can use anywhere')
    .addAttachmentOption((o) => o.setName('image').setDescription('The image to upload').setRequired(true)),

  name: 'imagelink',
  aliases: ['imglink', 'il', 'cdn'],
  description: 'Upload an image and get a link you can use anywhere',
  category: 'utility',

  async execute(ctx) {
    const slash = ctx.isChatInputCommand?.();
    const say = (content, extra = {}) => (slash
      ? (ctx.deferred ? ctx.editReply({ content, ...extra }) : ctx.reply({ content, ...extra }))
      : ctx.reply({ content, allowedMentions: { repliedUser: false }, ...extra }));

    let att = slash ? ctx.options.getAttachment('image', true) : ctx.attachments?.first();
    if (!slash && !att && ctx.reference?.messageId) {
      const ref = await ctx.fetchReference().catch(() => null);
      att = ref?.attachments?.find(isImage) ?? ref?.attachments?.first();
    }

    if (!att) return say('Attach an image to your message, or reply to a message that has one.');
    if (!isImage(att)) return say('That file isn\'t an image.', slash ? { flags: D.MessageFlags.Ephemeral } : {});
    if (att.size > MAX_BYTES) return say('That image is too big. The limit is 20 MB.', slash ? { flags: D.MessageFlags.Ephemeral } : {});

    if (slash) await ctx.deferReply();
    else ctx.channel.sendTyping?.().catch(() => {});

    try {
      return await say(copyBlock(await host(att), 'Here\'s your image link, copy it below.'));
    } catch (e) {
      if (process.env.IMGLINK_DEBUG) console.error('imagelink:', e);
      // fallback: Discord's own link (works for about a day)
      return say(`${copyBlock(att.url, 'Here\'s your image link, copy it below.')}\n-# Couldn't make a permanent link, so this Discord link will expire in about a day.`);
    }
  },
};
