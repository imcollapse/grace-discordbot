// grace · captcha gate for lookup / vanity / usernames.
//   ensure(ctx) → true when the person may continue (premium, or solved a captcha in the last 12 hours).
//   Otherwise a captcha card is shown; the promise settles once it is solved (true), or expires (false).

const { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const ui = require('./ui');
const captcha = require('./captchaCard');
const { icon } = require('./icons');
const db = require('../database/lookup');

const V2 = MessageFlags.IsComponentsV2;
const NO = { parse: [] };
const HOURS = 12, TRIES = 4, WAIT = 180000;
const passes = new Map();   // userId -> expiry ms

const userOf = (ctx) => ctx.user ?? ctx.author;

async function hasPass(userId) {
  const now = Date.now();
  const mem = passes.get(userId);
  if (mem && mem > now) return true;
  try {
    if (await require('./premium').isUserPremium(userId)) return true;
    const until = await db.getPass(userId);
    if (until && new Date(until).getTime() > now) { passes.set(userId, new Date(until).getTime()); return true; }
  } catch (e) { console.error('[lookup gate]', e.message); }
  return false;
}

async function grant(userId) {
  const until = Date.now() + HOURS * 3600000;
  passes.set(userId, until);
  db.setPass(userId, new Date(until)).catch(() => {});
}

function view(card, { note = null, off = false } = {}) {
  const c = ui.box('base');
  c.addTextDisplayComponents(ui.text('### Quick check\nType the characters in the image to continue.'));
  c.addSeparatorComponents(ui.sep());
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://captcha.png')));
  if (note) c.addTextDisplayComponents(ui.text(note));
  c.addSeparatorComponents(ui.sep());
  c.addActionRowComponents(ui.row(
    ui.btn('lkc_enter', 'Enter the code', { style: 'primary', emoji: icon('lookup_edit', '') || undefined, disabled: off }),
    ui.btn('lkc_new', 'New image', { emoji: icon('lookup_refresh', '') || undefined, disabled: off }),
  ));
  c.addTextDisplayComponents(ui.text(ui.sub(`Solve it once and you are set for ${HOURS} hours. Premium skips it.`)));
  return { components: [c], files: [new AttachmentBuilder(card.buffer, { name: 'captcha.png' })], flags: V2, allowedMentions: NO };
}

async function ensure(ctx) {
  const user = userOf(ctx);
  if (await hasPass(user.id)) return true;

  let card = captcha.render(captcha.makeCode(5));
  const msg = await ui.send(ctx, [view(card).components[0]], { extra: { files: view(card).files, allowedMentions: NO } });
  if (!msg?.createMessageComponentCollector) return false;

  return new Promise((resolve) => {
    let tries = 0, settled = false;
    const col = msg.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: WAIT });
    const finish = (ok, why) => { if (settled) return; settled = true; col.stop(why); resolve(ok); };

    col.on('collect', async (i) => {
      try {
        if (i.customId === 'lkc_new') {
          card = captcha.render(captcha.makeCode(5));
          return i.update(view(card));
        }
        if (i.customId !== 'lkc_enter') return;
        const id = `lkc_m_${i.id}`;
        await i.showModal(new ModalBuilder().setCustomId(id).setTitle('Quick check').addLabelComponents(
          new LabelBuilder().setLabel('Characters in the image').setTextInputComponent(
            new TextInputBuilder().setCustomId('code').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(8).setPlaceholder('For example K7MQX')),
        ));
        const sub = await i.awaitModalSubmit({ time: 120000, filter: (m) => m.customId === id && m.user.id === user.id }).catch(() => null);
        if (!sub) return;
        const typed = sub.fields.getTextInputValue('code').trim().toUpperCase().replace(/\s+/g, '');
        if (typed === card.code) {
          await grant(user.id);
          await sub.deferUpdate().catch(() => {});
          await msg.delete().catch(() => {});
          return finish(true, 'solved');
        }
        tries++;
        if (tries >= TRIES) {
          await sub.update({ components: [ui.fail('Too many wrong codes. Run the command again to get a new check.')], files: [], flags: V2, allowedMentions: NO }).catch(() => {});
          return finish(false, 'failed');
        }
        card = captcha.render(captcha.makeCode(5));
        return sub.update(view(card, { note: ui.sub(`That was not right. ${TRIES - tries} ${TRIES - tries === 1 ? 'try' : 'tries'} left, here is a new image.`) }));
      } catch (e) { console.error('[lookup gate]', e.message); }
    });
    col.on('end', () => {
      if (!settled) { settled = true; msg.edit({ components: [ui.warn('The check expired. Run the command again.')], files: [], flags: V2, allowedMentions: NO }).catch(() => {}); resolve(false); }
    });
  });
}

module.exports = { ensure, hasPass };
