// grace · the lookup panel: browse the usernames and vanity codes the bot has seen released.
// Tabs, search, length / character filters, sort and match mode, paged 10 at a time.

const { ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, SectionBuilder, MessageFlags } = require('discord.js');
const ui = require('./ui');
const { icon } = require('./icons');
const db = require('../database/lookup');

const V2 = MessageFlags.IsComponentsV2;
const NO = { parse: [] };
const PER = 10;
const mdEsc = (s) => s.replace(/([\\*_~`|>])/g, '\\$1');
const ico = (k) => icon(k, '') || undefined;

const SORTS = [['new', 'Newest first'], ['old', 'Oldest first'], ['az', 'A to Z'], ['za', 'Z to A'], ['short', 'Shortest first'], ['long', 'Longest first']];
const MODES = [['contains', 'Contains'], ['starts', 'Starts with'], ['ends', 'Ends with'], ['exact', 'Exact match']];
const CHARS = [['all', 'Any characters'], ['alnum', 'Letters and numbers'], ['letters', 'Letters only'], ['numbers', 'Numbers only']];
const label = (list, v) => list.find(([k]) => k === v)?.[1] ?? '';

const fresh = (kind = 'username') => ({ kind, q: '', mode: 'contains', min: 0, max: 0, chars: 'all', sort: 'new', page: 0 });

async function open(ctx, kind = 'username') {
  const user = ctx.user ?? ctx.author;
  const s = fresh(kind);
  const id = `lkp${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
  let data = { total: 0, rows: [] }, everything = 0;

  const load = async () => {
    data = await db.search(s.kind, s, PER, s.page * PER);
    if (s.page > 0 && !data.rows.length) { s.page = Math.max(0, Math.ceil(data.total / PER) - 1); data = await db.search(s.kind, s, PER, s.page * PER); }
    everything = await db.count(s.kind);
  };

  const lengthText = () => `${s.min || s.max ? `${s.min || 1}${s.max ? ` to ${s.max}` : '+'} characters` : 'Any length'}  ·  ${label(CHARS, s.chars)}`;
  const view = (off = false) => {
    const pages = Math.max(1, Math.ceil(data.total / PER));
    const c = ui.box('base');
    c.addTextDisplayComponents(ui.text('### Advanced Lookup\nSearch, filter and sort the names the bot has seen released.'));
    c.addSeparatorComponents(ui.sep());
    c.addActionRowComponents(ui.row(
      ui.btn(`${id}_tu`, 'Released Usernames', { style: s.kind === 'username' ? 'primary' : 'secondary', emoji: ico('lookup_user'), disabled: off }),
      ui.btn(`${id}_tv`, 'Released Vanities', { style: s.kind === 'vanity' ? 'primary' : 'secondary', emoji: ico('lookup_vanity'), disabled: off }),
    ));
    c.addSeparatorComponents(ui.sep());
    c.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(ui.text(`**Search**\n${s.q ? `\`${s.q.replace(/`/g, "'")}\`` : ui.sub('No search term')}`))
      .setButtonAccessory(ui.btn(`${id}_q`, 'Edit', { emoji: ico('lookup_edit'), disabled: off })));
    c.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(ui.text(`**Length**\n${lengthText()}`))
      .setButtonAccessory(ui.btn(`${id}_l`, 'Edit', { emoji: ico('lookup_edit'), disabled: off })));
    c.addSeparatorComponents(ui.sep());
    c.addActionRowComponents(ui.row(ui.select(`${id}_s`, 'Sort', SORTS.map(([value, name]) => ({ label: name, value, default: value === s.sort })), { disabled: off })));
    c.addActionRowComponents(ui.row(ui.select(`${id}_m`, 'Match', MODES.map(([value, name]) => ({ label: name, value, default: value === s.mode })), { disabled: off })));
    c.addSeparatorComponents(ui.sep());
    c.addTextDisplayComponents(ui.text(data.rows.length
      ? data.rows.map(r => `**${mdEsc(r.name)}** · <t:${Math.floor(new Date(r.dropped_at).getTime() / 1000)}:R>`).map(l => `> ${l}`).join('\n')
      : everything ? 'Nothing matches those filters.' : `No ${s.kind === 'vanity' ? 'vanity codes' : 'usernames'} recorded yet. The list grows as the bot sees names being released.`));
    c.addSeparatorComponents(ui.sep());
    c.addTextDisplayComponents(ui.text(ui.sub(`${data.total.toLocaleString('en')} results  ·  Page ${s.page + 1}/${pages}`)));
    c.addActionRowComponents(ui.row(
      ui.btn(`${id}_p`, null, { emoji: icon('arrow_left', '◀'), disabled: off || s.page === 0 }),
      ui.btn(`${id}_n`, null, { emoji: icon('arrow_right', '▶'), disabled: off || s.page >= pages - 1 }),
      ui.btn(`${id}_r`, 'Reset', { emoji: ico('lookup_reset'), disabled: off }),
      ui.deleteBtn(`${id}_x`).setDisabled(off),
    ));
    return { components: [c], flags: V2, allowedMentions: NO };
  };

  await load();
  const msg = await ui.send(ctx, [view().components[0]], { extra: { allowedMentions: NO } });
  if (!msg?.createMessageComponentCollector) return msg;
  const col = msg.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 600000 });

  const ask = async (i, modal, key) => {
    await i.showModal(modal);
    return i.awaitModalSubmit({ time: 120000, filter: (m) => m.customId === key && m.user.id === user.id }).catch(() => null);
  };
  const num = (v) => { const n = parseInt(String(v).trim(), 10); return Number.isFinite(n) && n > 0 ? Math.min(n, 64) : 0; };

  col.on('collect', async (i) => {
    try {
      const k = i.customId.slice(id.length + 1);
      if (k === 'x') { col.stop('deleted'); return msg.delete().catch(() => {}); }
      if (k === 'tu' || k === 'tv') { s.kind = k === 'tu' ? 'username' : 'vanity'; s.page = 0; }
      else if (k === 'p') s.page = Math.max(0, s.page - 1);
      else if (k === 'n') s.page += 1;
      else if (k === 'r') Object.assign(s, fresh(s.kind));
      else if (k === 's') { s.sort = i.values[0]; s.page = 0; }
      else if (k === 'm') { s.mode = i.values[0]; s.page = 0; }
      else if (k === 'q') {
        const key = `${id}_qm`;
        const sub = await ask(i, new ModalBuilder().setCustomId(key).setTitle('Search').addLabelComponents(
          new LabelBuilder().setLabel('Search').setTextInputComponent(new TextInputBuilder().setCustomId('q').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32).setPlaceholder('Leave empty to clear').setValue(s.q || ''))), key);
        if (!sub) return;
        s.q = sub.fields.getTextInputValue('q').trim().toLowerCase(); s.page = 0;
        await load(); return sub.update(view());
      } else if (k === 'l') {
        const key = `${id}_lm`;
        const sub = await ask(i, new ModalBuilder().setCustomId(key).setTitle('Length').addLabelComponents(
          new LabelBuilder().setLabel('Minimum length').setTextInputComponent(new TextInputBuilder().setCustomId('min').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2).setValue(s.min ? String(s.min) : '')),
          new LabelBuilder().setLabel('Maximum length').setTextInputComponent(new TextInputBuilder().setCustomId('max').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2).setValue(s.max ? String(s.max) : '')),
          new LabelBuilder().setLabel('Characters').setDescription('Restrict results to letters or numbers only').setStringSelectMenuComponent(
            new StringSelectMenuBuilder().setCustomId('chars').addOptions(CHARS.map(([value, name]) => ({ label: name, value, default: value === s.chars })))),
        ), key);
        if (!sub) return;
        s.min = num(sub.fields.getTextInputValue('min')); s.max = num(sub.fields.getTextInputValue('max'));
        if (s.min && s.max && s.min > s.max) [s.min, s.max] = [s.max, s.min];
        s.chars = sub.fields.getStringSelectValues('chars')[0] ?? 'all'; s.page = 0;
        await load(); return sub.update(view());
      } else return;
      await load();
      await i.update(view());
    } catch (e) { console.error('[lookup panel]', e.message); }
  });
  col.on('end', (_, why) => { if (why !== 'deleted') msg.edit(view(true)).catch(() => {}); });
  return msg;
}

module.exports = { open };
