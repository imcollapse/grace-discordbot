// grace · ,pinterest  ·  /pinterest
//   search <query>        browse pins
//   random <query>        one random pin
//   pin <link|id>         one pin, with its picture or video
//   download <link|id>    get the picture or video as a file
//   related <link|id>     pins like this one
//   user <name>           profile card
//   pins <name>           someone's newest pins
//   boards <name>         someone's boards
//   board <user/board>    pins on a board (a link works too)

const {
  SlashCommandBuilder, MessageFlags, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, ThumbnailBuilder,
} = require('discord.js');
const ui = require('../../../services/ui');
const { icon, pre } = require('../../../services/icons');
const emojis = require('../../../media/emojis.json');
const pin = require('../../../services/pinterest');

const V2 = MessageFlags.IsComponentsV2;
const NO = { parse: [] };
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const num = (n) => (n === null || n === undefined ? null : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const RED = 0xE60023;

/* ── plumbing ──────────────────────────────────────────────────────── */

const isSlash = (ctx) => !!ctx.isChatInputCommand?.();
const userOf = (ctx) => ctx.user ?? ctx.author;
const send = (ctx, comps, extra = {}) => ui.send(ctx, comps, { extra: { allowedMentions: NO, ...extra } });

/** Reply that works for messages, fresh interactions and deferred ones. */
function plain(ctx, payload) {
  if (ctx.reply && !ctx.isRepliable?.()) return ctx.reply({ allowedMentions: NO, ...payload });
  if (ctx.deferred && !ctx.replied) return ctx.editReply(payload);
  return ctx.replied ? ctx.followUp(payload) : ctx.reply(payload);
}

const note = (kind, text, sub) => ui.notice(kind, text, sub ? { footer: sub } : {});

async function guarded(ctx, fn) {
  try { return await fn(); }
  catch (e) {
    if (!(e instanceof pin.PinterestError)) console.error('[pinterest]', e);
    const msg = e instanceof pin.PinterestError ? e.message : 'Something went wrong while talking to Pinterest.';
    return send(ctx, note('error', msg)).catch(() => {});
  }
}

/* ── pin viewer ────────────────────────────────────────────────────── */

function pinCard(p, { at, total, more, label }) {
  const c = ui.box('base').setAccentColor(p.color ?? RED);
  c.addTextDisplayComponents(ui.text(`### ${pre('pinterest')}${clip(p.title, 150) || 'Pinterest pin'}`));
  if (p.desc && p.desc !== p.title) c.addTextDisplayComponents(ui.text(clip(p.desc, 350)));
  if (p.image) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(p.image)));
  const meta = [
    p.author ? `by **${clip(p.author.name, 40)}** (@${p.author.username})` : null,
    p.board ? `on **${clip(p.board.name, 40)}**` : null,
    p.saves ? `${num(p.saves)} saves` : null,
    p.video ? 'video' : null,
    p.domain ? p.domain : null,
  ].filter(Boolean).join('  ·  ');
  if (meta) c.addTextDisplayComponents(ui.text(meta));
  c.addTextDisplayComponents(ui.text(ui.sub(`${label} • ${at + 1}/${total}${more ? '+' : ''} • pinterest.com`)));
  return c;
}

/**
 * Page through pins. `load` (optional) fetches the next batch: async (bookmark) => { pins, bookmark }.
 */
async function viewPins(ctx, { pins, bookmark = null, load = null, label = 'Pinterest' }) {
  if (!pins.length) return send(ctx, note('warning', 'Nothing found.'));
  const user = userOf(ctx);
  const id = `pin_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  let at = 0, next = bookmark;

  const view = (off = false) => {
    const p = pins[at];
    const c = pinCard(p, { at, total: pins.length, more: !!next, label });
    c.addActionRowComponents(ui.row(
      ui.btn(`${id}_p`, null, { emoji: emojis.arrow_left || '◀', disabled: off || at === 0 }),
      ui.btn(`${id}_n`, null, { emoji: emojis.arrow_right || '▶', disabled: off || (at >= pins.length - 1 && !next) }),
      ui.link('Open', p.url, icon('pinterest') || undefined),
      ui.btn(`${id}_d`, 'Save file', { disabled: off }),
      ui.deleteBtn(`${id}_x`).setDisabled(off),
    ));
    return c;
  };

  const msg = await send(ctx, view());
  if (!msg?.createMessageComponentCollector) return;
  const col = msg.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 600000 });

  col.on('collect', async (i) => {
    try {
      if (i.customId === `${id}_x`) { col.stop('deleted'); return msg.delete().catch(() => {}); }
      if (i.customId === `${id}_d`) return sendFile(i, pins[at]);

      if (i.customId === `${id}_p`) at = Math.max(0, at - 1);
      else if (i.customId === `${id}_n`) {
        if (at >= pins.length - 1 && next && load) {
          await i.deferUpdate();
          try {
            const more = await load(next);
            const seen = new Set(pins.map(x => x.id));
            pins.push(...more.pins.filter(x => !seen.has(x.id)));
            next = more.bookmark;
          } catch { next = null; }
          if (at < pins.length - 1) at++;
          return i.editReply({ components: [view()], flags: V2, allowedMentions: NO });
        }
        at = Math.min(pins.length - 1, at + 1);
      }
      await i.update({ components: [view()], flags: V2, allowedMentions: NO });
    } catch (e) { console.error('[pinterest] viewer:', e.message); }
  });
  col.on('end', (_, why) => { if (why !== 'deleted') msg.edit({ components: [view(true)], flags: V2 }).catch(() => {}); });
}

/** Send the picture or video of a pin as a file. `ctx` can be a message, a command or a button. */
async function sendFile(ctx, p) {
  if (ctx.isRepliable?.() && !ctx.deferred && !ctx.replied) await ctx.deferReply();
  const media = await pin.fetchMedia(p);
  if (!media) {
    return plain(ctx, { components: [note('warning', 'That file is too big to upload here.', p.video ?? p.image ?? p.url)], flags: V2, allowedMentions: NO });
  }
  const name = `pinterest-${p.id}.${media.ext}`;
  return plain(ctx, { content: `${p.title ? `**${clip(p.title, 100)}**\n` : ''}${p.url}`, files: [new AttachmentBuilder(media.buffer, { name })], allowedMentions: NO });
}

/* ── commands ──────────────────────────────────────────────────────── */

async function cmdSearch(ctx, query, { random = false } = {}) {
  if (!query) return send(ctx, note('warning', 'What should I look for?', 'pinterest search <query>'));
  const r = await pin.search(query);
  if (!r.pins.length) return send(ctx, note('warning', `No pins found for **${clip(query, 60)}**.`));
  if (random) {
    const p = r.pins[Math.floor(Math.random() * r.pins.length)];
    return viewPins(ctx, { pins: [p], label: `Random: ${clip(query, 40)}` });
  }
  return viewPins(ctx, { pins: r.pins, bookmark: r.bookmark, load: (b) => pin.search(query, b), label: `Search: ${clip(query, 40)}` });
}

async function getPin(input) {
  const id = await pin.parsePinId(input);
  if (!id) throw new pin.PinterestError('That is not a pin link. Use a pinterest.com/pin/… or pin.it link.', 'notfound');
  return pin.pin(id);
}

async function cmdPin(ctx, input) {
  if (!input) return send(ctx, note('warning', 'Give me a pin link.', 'pinterest pin <link>'));
  const p = await getPin(input);
  return viewPins(ctx, { pins: [p], label: 'Pin' });
}

async function cmdDownload(ctx, input) {
  if (!input) return send(ctx, note('warning', 'Give me a pin link.', 'pinterest download <link>'));
  const p = await getPin(input);
  return sendFile(ctx, p);
}

async function cmdRelated(ctx, input) {
  if (!input) return send(ctx, note('warning', 'Give me a pin link.', 'pinterest related <link>'));
  const id = await pin.parsePinId(input);
  if (!id) throw new pin.PinterestError('That is not a pin link.', 'notfound');
  const r = await pin.related(id);
  if (!r.pins.length) return send(ctx, note('warning', 'No related pins found.'));
  return viewPins(ctx, { pins: r.pins, bookmark: r.bookmark, load: (b) => pin.related(id, b), label: 'Related pins' });
}

async function cmdPins(ctx, name) {
  const u = pin.cleanUser(name);
  if (!u) return send(ctx, note('warning', 'Whose pins?', 'pinterest pins <username>'));
  const r = await pin.userPins(u);
  if (!r.pins.length) return send(ctx, note('warning', `**${u}** has no public pins.`));
  return viewPins(ctx, { pins: r.pins, bookmark: r.bookmark, load: (b) => pin.userPins(u, b), label: `@${u}` });
}

async function cmdBoard(ctx, input) {
  const ref = pin.parseBoard(input);
  if (!ref) return send(ctx, note('warning', 'Give me a board.', 'pinterest board <username/board> or a board link'));
  const b = await pin.board(ref.username, ref.slug);
  const r = await pin.boardPins(b.id, null, `/${ref.username}/${ref.slug}/`);
  if (!r.pins.length) return send(ctx, note('warning', `**${clip(b.name, 60)}** has no pins.`));
  return viewPins(ctx, { pins: r.pins, bookmark: r.bookmark, load: (bm) => pin.boardPins(b.id, bm, `/${ref.username}/${ref.slug}/`), label: `Board: ${clip(b.name, 40)}` });
}

async function cmdUser(ctx, name) {
  if (!name) return send(ctx, note('warning', 'Whose profile?', 'pinterest user <username>'));
  const u = await pin.user(name);
  const c = ui.box('base').setAccentColor(RED);
  const head = `## ${clip(u.name, 60)}${u.verified ? `  ${emojis.success}` : ''}\n-# @${u.username}`;
  if (u.avatar) c.addSectionComponents(new SectionBuilder().addTextDisplayComponents(ui.text(head)).setThumbnailAccessory(new ThumbnailBuilder().setURL(u.avatar)));
  else c.addTextDisplayComponents(ui.text(head));
  if (u.about) c.addTextDisplayComponents(ui.text(clip(u.about, 400)));
  if (u.cover) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(u.cover)));
  c.addSeparatorComponents(ui.sep(false));
  const stats = [
    u.followers !== null && `**${num(u.followers)}** followers`, u.following !== null && `**${num(u.following)}** following`,
    u.pins !== null && `**${num(u.pins)}** pins`, u.boards !== null && `**${num(u.boards)}** boards`, u.monthly && `**${num(u.monthly)}** monthly views`,
  ].filter(Boolean).join('  ·  ');
  if (stats) c.addTextDisplayComponents(ui.text(stats));
  if (u.website) c.addTextDisplayComponents(ui.text(`${u.website}`));

  const id = `pinu_${Date.now().toString(36)}`;
  c.addActionRowComponents(ui.row(ui.link('Profile', u.url), ui.btn(`${id}_pins`, 'Pins', { style: 'primary' }), ui.btn(`${id}_boards`, 'Boards')));
  const msg = await send(ctx, c);
  if (!msg?.createMessageComponentCollector) return;
  const user = userOf(ctx);
  msg.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 300000 }).on('collect', async (i) => {
    try {
      await i.deferReply();
      if (i.customId === `${id}_pins`) await guarded(i, () => cmdPins(i, u.username));
      else await guarded(i, () => cmdBoards(i, u.username));
    } catch (e) { console.error('[pinterest] profile:', e.message); }
  });
}

async function cmdBoards(ctx, name) {
  const u = pin.cleanUser(name);
  if (!u) return send(ctx, note('warning', 'Whose boards?', 'pinterest boards <username>'));
  const r = await pin.userBoards(u);
  const boards = r.boards;
  if (!boards.length) return send(ctx, note('warning', `**${u}** has no public boards.`));

  const PER = 6;
  const pages = Math.ceil(boards.length / PER);
  const id = `pinb_${Date.now().toString(36)}`;
  let at = 0;
  const view = (off = false) => {
    const slice = boards.slice(at * PER, at * PER + PER);
    const c = ui.box('base').setAccentColor(RED)
      .addTextDisplayComponents(ui.text(`### Boards by @${u}`))
      .addSeparatorComponents(ui.sep(false))
      .addTextDisplayComponents(ui.text(slice.map(b => `**${clip(b.name, 60)}**${b.pins !== null ? `  ·  ${num(b.pins)} pins` : ''}${b.desc ? `\n-# ${clip(b.desc, 90)}` : ''}`).join('\n\n')));
    c.addActionRowComponents(ui.row(ui.select(`${id}_s`, 'Open a board…', slice.map((b, i) => ({ label: clip(b.name, 90), value: String(at * PER + i), description: b.pins !== null ? `${b.pins} pins` : undefined })), { disabled: off })));
    c.addActionRowComponents(ui.row(
      ui.btn(`${id}_p`, null, { emoji: emojis.arrow_left || '◀', disabled: off || at === 0 }),
      ui.btn(`${id}_n`, null, { emoji: emojis.arrow_right || '▶', disabled: off || at >= pages - 1 }),
      ui.link('Profile', `${pin.BASE}/${u}/`),
    ));
    c.addTextDisplayComponents(ui.text(ui.sub(`Boards • page ${at + 1}/${pages} • pinterest.com`)));
    return c;
  };
  const msg = await send(ctx, view());
  if (!msg?.createMessageComponentCollector) return;
  const user = userOf(ctx);
  const col = msg.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 300000 });
  col.on('collect', async (i) => {
    try {
      if (i.customId === `${id}_p`) { at = Math.max(0, at - 1); return i.update({ components: [view()], flags: V2, allowedMentions: NO }); }
      if (i.customId === `${id}_n`) { at = Math.min(pages - 1, at + 1); return i.update({ components: [view()], flags: V2, allowedMentions: NO }); }
      if (i.customId === `${id}_s`) {
        const b = boards[Number(i.values[0])];
        await i.deferReply();
        return guarded(i, () => cmdBoard(i, b.url || `${u}/${b.name}`));
      }
    } catch (e) { console.error('[pinterest] boards:', e.message); }
  });
  col.on('end', () => msg.edit({ components: [view(true)], flags: V2 }).catch(() => {}));
}

/* ── command definition ────────────────────────────────────────────── */

const opt = (b, name, desc) => b.addStringOption(o => o.setName(name).setDescription(desc).setRequired(true).setMaxLength(300));

const data = new SlashCommandBuilder().setName('pinterest').setDescription('Browse Pinterest: pins, boards and profiles');
const SUBS = [
  ['search', 'Search pins', 'query', 'What to look for'],
  ['random', 'One random pin for a search', 'query', 'What to look for'],
  ['pin', 'Show one pin', 'link', 'Pin link or id'],
  ['download', 'Get a pin\'s picture or video as a file', 'link', 'Pin link or id'],
  ['related', 'Pins like another pin', 'link', 'Pin link or id'],
  ['user', 'Show a profile', 'username', 'Pinterest username'],
  ['pins', 'A user\'s newest pins', 'username', 'Pinterest username'],
  ['boards', 'A user\'s boards', 'username', 'Pinterest username'],
  ['board', 'Pins on a board', 'board', 'username/board or a board link'],
];
for (const [name, desc, o, od] of SUBS) data.addSubcommand(s => opt(s.setName(name).setDescription(desc), o, od));

const RUN = {
  search: (c, q) => cmdSearch(c, q), random: (c, q) => cmdSearch(c, q, { random: true }), pin: cmdPin, download: cmdDownload,
  related: cmdRelated, user: cmdUser, pins: cmdPins, boards: cmdBoards, board: cmdBoard,
};
const ALIAS = { find: 'search', s: 'search', rand: 'random', p: 'pin', dl: 'download', save: 'download', similar: 'related', profile: 'user', u: 'user', feed: 'pins', b: 'board' };

module.exports = {
  data,
  slashOptional: true,           // dropped first if the 100 slash command limit is hit; the prefix command always works

  name: 'pinterest',
  aliases: ['pin', 'pinte', 'pint'],
  description: 'Browse Pinterest: pins, boards and profiles',
  usage: 'pinterest <search|random|pin|download|related|user|pins|boards|board> <…>',
  category: 'social',

  async execute(ctx, args = []) {
    if (isSlash(ctx)) {
      if (!ctx.deferred && !ctx.replied) await ctx.deferReply();
      const sub = ctx.options.getSubcommand();
      const [, , o] = SUBS.find(x => x[0] === sub);
      return guarded(ctx, () => RUN[sub](ctx, ctx.options.getString(o)));
    }

    if (!args.length) return require('../../../services/helpMenu').showCommand(ctx, 'pinterest');
    ctx.channel?.sendTyping?.().catch(() => {});

    let sub = (args[0] || '').toLowerCase();
    sub = ALIAS[sub] ?? sub;
    let rest = args.slice(1).join(' ').trim();
    if (!RUN[sub]) {                       // `pinterest cats` = search, `pinterest <pin link>` = pin
      const all = args.join(' ').trim();
      sub = /pinterest\.[a-z.]+\/pin\/|pin\.it\//i.test(all) ? 'pin' : 'search';
      rest = all;
    }
    return guarded(ctx, () => RUN[sub](ctx, rest));
  },
};
