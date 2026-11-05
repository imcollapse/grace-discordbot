// grace · AI reply cards: a titled container, a footer line (model · time · page) and ◀ ▶ Reply buttons.

const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder, FileBuilder } = require('discord.js');
const ui = require('./ui');
const emojis = require('../media/emojis.json');
const provider = require('./aiProvider');
const { SYSTEM_PROMPT, processAiResponse } = require('./aiUtils');
const { saveMessage, getHistory } = require('../database/aiHistory');

const PAGE = 3200;
const clip = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + '…' : String(t));
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const userOf = (t) => t.user ?? t.author;

function paginate(text) {
  const pages = [];
  let rest = text.trim();
  while (rest.length > PAGE) {
    let at = rest.lastIndexOf('\n', PAGE);
    if (at < PAGE * 0.5) at = rest.lastIndexOf(' ', PAGE);
    if (at < PAGE * 0.5) at = PAGE;
    pages.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  pages.push(rest);
  return pages;
}

const thinking = (ctx, label = 'is thinking') => ui.send(ctx, ui.box('base').addTextDisplayComponents(ui.text(`${emojis.loading} ${ctx.client.user.username} ${label}...`)));
/** Fill the "thinking" message (prefix) or answer the deferred interaction (slash). */
const deliver = (thinkMsg, ctx, comps, extra = {}) => (thinkMsg
  ? thinkMsg.edit({ content: null, components: [comps].flat(), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] }, ...extra })
  : ui.send(ctx, comps, { extra: { allowedMentions: { parse: [] }, ...extra } }));
const fail = (thinkMsg, ctx, text) => deliver(thinkMsg, ctx, ui.fail(text));

/** Show a finished answer. `msg` is the "thinking" message (edited) or the interaction (already deferred). */
async function showAnswer(ctx, thinkMsg, { title, text, model, host, ms, convo }) {
  const user = userOf(ctx);
  const pages = paginate(text);
  const id = `aic_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  let at = 0;

  const view = (disabled = false) => {
    const c = ui.box('base')
      .addTextDisplayComponents(ui.text(`## ${clip(title, 120)}`))
      .addSeparatorComponents(ui.sep())
      .addTextDisplayComponents(ui.text(pages[at]))
      .addSeparatorComponents(ui.sep())
      .addTextDisplayComponents(ui.text(ui.sub(`${model} • took ${secs(ms)} • ${at + 1}/${pages.length} • ${host}`)));
    c.addActionRowComponents(ui.row(
      ui.btn(`${id}_p`, null, { emoji: emojis.arrow_left || '◀', disabled: disabled || at === 0 }),
      ui.btn(`${id}_n`, null, { emoji: emojis.arrow_right || '▶', disabled: disabled || at >= pages.length - 1 }),
      ui.btn(`${id}_r`, 'Reply', { style: 'primary', disabled }),
    ));
    return c;
  };

  const sent = await deliver(thinkMsg, ctx, view()).catch(() => null);
  const message = sent;
  if (!message?.createMessageComponentCollector) return;

  const col = message.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 600000 });
  col.on('collect', async (i) => {
    try {
      if (i.customId === `${id}_p`) { at = Math.max(0, at - 1); return i.update({ components: [view()], flags: MessageFlags.IsComponentsV2 }); }
      if (i.customId === `${id}_n`) { at = Math.min(pages.length - 1, at + 1); return i.update({ components: [view()], flags: MessageFlags.IsComponentsV2 }); }

      const modal = new ModalBuilder().setCustomId(`${id}_m`).setTitle('Reply to ' + ctx.client.user.username).addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q').setLabel('Your message')
          .setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true)));
      await i.showModal(modal);
      const m = await i.awaitModalSubmit({ time: 300000, filter: x => x.customId === `${id}_m` && x.user.id === user.id }).catch(() => null);
      if (!m) return;
      await m.deferReply();
      await runChat(m, m.fields.getTextInputValue('q'), { convo: [...convo, { role: 'assistant', content: text }] });
    } catch (e) { console.error('[ai] card:', e.message); }
  });
  col.on('end', () => message.edit({ components: [view(true)], flags: MessageFlags.IsComponentsV2 }).catch(() => {}));
}

/** Ask the AI and show the card. `convo` carries earlier turns for the Reply button. */
async function runChat(ctx, prompt, { system = SYSTEM_PROMPT, convo = null, title, remember = true, label } = {}) {
  const user = userOf(ctx);
  const isSlash = !!ctx.isChatInputCommand?.() || !!ctx.isModalSubmit?.();
  const thinkMsg = isSlash ? null : await thinking(ctx).catch(() => null);

  let history = convo;
  if (!history && remember && ctx.guildId) {
    const old = await getHistory(user.id, ctx.channelId, ctx.guildId).catch(() => []);
    history = old.slice(-8).map(m => ({ role: m.role, content: m.content }));
  }
  history = history || [];
  const messages = [{ role: 'system', content: system }, ...history.slice(-8), { role: 'user', content: prompt }];

  const r = await provider.chat(messages);
  if (!r.success) return fail(thinkMsg, ctx, r.error);

  const text = processAiResponse(r.content);
  if (remember && ctx.guildId) {
    try { saveMessage(ctx.guildId, ctx.channelId, user.id, 'user', prompt); saveMessage(ctx.guildId, ctx.channelId, user.id, 'assistant', text); } catch (_) { /* history is optional */ }
  }
  return showAnswer(ctx, thinkMsg, { title: title || prompt, text, model: label || r.label || r.model, host: r.host, ms: r.ms, convo: [...history, { role: 'user', content: prompt }] });
}

/** Image card with Regenerate. */
async function runImage(ctx, prompt, { model, shape = 'square' } = {}) {
  const user = userOf(ctx);
  const isSlash = !!ctx.isChatInputCommand?.();
  const thinkMsg = isSlash ? null : await thinking(ctx, 'is painting').catch(() => null);
  const id = `aii_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

  let r = await provider.image(prompt, { model, shape });
  if (!r.success) return fail(thinkMsg, ctx, r.error);

  const view = (res, disabled = false) => ui.box('base')
    .addTextDisplayComponents(ui.text(`## ${clip(prompt, 120)}`))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://imagine.png')))
    .addSeparatorComponents(ui.sep())
    .addTextDisplayComponents(ui.text(ui.sub(`${res.model} • took ${secs(res.ms)} • 1/1 • ${res.host}`)))
    .addActionRowComponents(ui.row(
      ui.btn(`${id}_g`, 'Regenerate', { style: 'primary', disabled }),
      ui.deleteBtn(`${id}_d`).setDisabled(disabled),
    ));
  const file = (res) => new AttachmentBuilder(res.buffer, { name: 'imagine.png' });

  const message = await deliver(thinkMsg, ctx, view(r), { files: [file(r)] }).catch(() => null);
  if (!message?.createMessageComponentCollector) return;

  const col = message.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 600000 });
  col.on('collect', async (i) => {
    try {
      if (i.customId === `${id}_d`) { col.stop('deleted'); return message.delete().catch(() => {}); }
      await i.deferUpdate();
      const next = await provider.image(prompt, { model, shape });
      if (!next.success) return i.followUp({ components: [ui.fail(next.error)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      r = next;
      await i.editReply({ components: [view(r)], files: [file(r)], attachments: [], flags: MessageFlags.IsComponentsV2 });
    } catch (e) { console.error('[ai] image:', e.message); }
  });
  col.on('end', (_, why) => { if (why !== 'deleted') message.edit({ components: [view(r, true)], flags: MessageFlags.IsComponentsV2 }).catch(() => {}); });
}

/** Speech card with the audio file inside. */
async function runSpeech(ctx, text, { speaker, lang } = {}) {
  const isSlash = !!ctx.isChatInputCommand?.();
  const thinkMsg = isSlash ? null : await thinking(ctx, 'is speaking').catch(() => null);
  const r = await provider.speech(text, { speaker, lang });
  if (!r.success) return fail(thinkMsg, ctx, r.error);
  const c = ui.box('base')
    .addTextDisplayComponents(ui.text(`## ${clip(text, 120)}`))
    .addFileComponents(new FileBuilder().setURL('attachment://speech.mp3'))
    .addSeparatorComponents(ui.sep())
    .addTextDisplayComponents(ui.text(ui.sub(`${r.speaker} • ${r.lang} • took ${secs(r.ms)} • 1/1 • sarvam.ai`)));
  return deliver(thinkMsg, ctx, c, { files: [new AttachmentBuilder(r.buffer, { name: 'speech.mp3' })] });
}

module.exports = { runChat, runImage, runSpeech, showAnswer, thinking, fail, deliver };
