// grace · shared building blocks for the instagram / tiktok / twitter / reddit commands.
//   makeCommand({...}) builds a hybrid command (prefix + slash) from a list of sub-commands.
//   profileCard, viewPosts and sendMedia give every platform the same look.

const { SlashCommandBuilder, MessageFlags, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const ui = require('./ui');
const sc = require('./socialcrawl');
const { icon, pre } = require('./icons');
const { pager } = require('./pager');

const NO = { parse: [] };
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const num = (n) => (n === null || n === undefined ? null : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const ts = (d, f = 'R') => `<t:${Math.floor(d.getTime() / 1000)}:${f}>`;
const isSlash = (ctx) => !!ctx.isChatInputCommand?.();
const userOf = (ctx) => ctx.user ?? ctx.author;
const send = (ctx, comps) => ui.send(ctx, comps, { extra: { allowedMentions: NO } });
const note = (kind, text, footer) => ui.notice(kind, text, footer ? { footer } : {});
const gallery = (url) => new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url));
const isImg = (u) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u || '');

function plain(ctx, payload) {
  if (ctx.deferred && !ctx.replied) return ctx.editReply(payload);
  if (ctx.replied) return ctx.followUp(payload);
  if (ctx.isRepliable?.()) return ctx.reply(payload);
  return ctx.reply({ allowedMentions: NO, ...payload });
}

/* ── cards ─────────────────────────────────────────────────────────── */

const tick = (v) => (v ? ` ${icon('verified', '✔')}` : '');
const stat = (key, text) => `${pre(key)}${text}`;

function profileCard(a, { color, site, url, extra = [], platform = null }) {
  const stats = [
    a.followers !== null ? stat('social_followers', `**${num(a.followers)}** followers`) : null,
    a.following !== null ? stat('social_following', `**${num(a.following)}** following`) : null,
    a.posts !== null ? stat('social_posts', `**${num(a.posts)}** posts`) : null,
    a.likes !== null ? stat('social_likes', `**${num(a.likes)}** likes`) : null,
  ].filter(Boolean).join('  ·  ');
  const lines = [
    `## ${platform ? pre(platform) : ''}${clip(a.name || a.username || 'Unknown', 80)}${tick(a.verified)}`,
    a.username ? `@${a.username}${a.private ? '  ·  private account' : ''}` : '',
    a.bio ? clip(a.bio, 400) : '',
    stats,
    a.location ? `Location: ${clip(a.location, 60)}` : '',
    a.link ? `Link: ${clip(a.link, 100)}` : '',
    a.joined && !isNaN(a.joined) ? `Joined ${ts(a.joined, 'D')}` : '',
    ...extra,
  ].filter(Boolean).join('\n');
  const c = ui.box('base').setAccentColor(color);
  c.addSectionComponents(ui.section(lines, a.avatar));
  c.addTextDisplayComponents(ui.text(ui.sub(site)));
  const link = a.url || url;
  if (link) c.addActionRowComponents(ui.row(ui.link('Open profile', link, platform ? icon(platform) || undefined : undefined)));
  return c;
}

function postCard(p, { at, total, more, color, site, label, platform = null }) {
  const c = ui.box('base').setAccentColor(color);
  const who = p.author ? `**${clip(p.author.name || p.author.username || '', 50)}**${tick(p.author.verified)}${p.author.username ? `  @${p.author.username}` : ''}` : '';
  if (who) c.addTextDisplayComponents(ui.text(`${platform ? pre(platform) : ''}${who}`));
  if (p.title) c.addTextDisplayComponents(ui.text(`### ${clip(p.title, 200)}`));
  if (p.text && p.text !== p.title) c.addTextDisplayComponents(ui.text(clip(p.text, 700)));
  if (!p.title && !p.text) c.addTextDisplayComponents(ui.text(ui.sub('No caption')));
  const img = p.thumb || (!p.duration && p.media.find(isImg)) || null;
  if (img) c.addMediaGalleryComponents(gallery(img));
  const line = [
    p.views !== null ? stat('social_views', `${num(p.views)} views`) : null, p.likes !== null ? stat('social_likes', `${num(p.likes)} likes`) : null,
    p.comments !== null ? stat('social_comments', `${num(p.comments)} comments`) : null, p.shares !== null ? stat('social_shares', `${num(p.shares)} shares`) : null,
    p.saves ? stat('social_saves', `${num(p.saves)} saves`) : null,
    p.duration ? stat('social_video', `${p.duration}s video`) : (p.media.length > 1 ? `${p.media.length} items` : null),
    p.pinned ? 'pinned' : null,
    p.published && !isNaN(p.published) ? ts(p.published) : null,
  ].filter(Boolean).join('  ·  ');
  if (line) c.addTextDisplayComponents(ui.text(line));
  c.addTextDisplayComponents(ui.text(ui.sub(`${label ? label + ' • ' : ''}${at + 1}/${total}${more ? '+' : ''} • ${site}`)));
  return c;
}

/**
 * Page through posts. `next` (optional) loads the following page: async (cursor) => ({ posts, cursor }).
 */
async function viewPosts(ctx, { posts, cursor = null, next = null, color, site, label, platform = null }) {
  if (!posts.length) return send(ctx, note('warning', 'Nothing found.'));
  let cur = cursor;
  const limit = ctx.guild?.maximumUploadLimit ?? 10 * 1024 * 1024;
  return pager(ctx, {
    total: () => posts.length, user: userOf(ctx), send: (c) => send(ctx, c),
    render: (at) => postCard(posts[at], { at, total: posts.length, more: !!cur && !!next, color, site, label, platform }),
    extra: (at, id) => [
      ...(posts[at].url ? [ui.link('Open', posts[at].url, platform ? icon(platform) || undefined : undefined)] : []),
      ...(posts[at].media.length ? [ui.btn(`${id}_s`, 'Save file')] : []),
    ],
    handle: async (i, at, id) => {
      if (i.customId !== `${id}_s`) return false;
      await i.deferReply().catch(() => {});
      await sendMedia(i, posts[at], limit);
      return true;
    },
    loadMore: next ? async () => {
      if (!cur) return false;
      const r = await next(cur);
      const seen = new Set(posts.map(x => x.id));
      const fresh = r.posts.filter(x => !x.id || !seen.has(x.id));
      cur = r.cursor;
      posts.push(...fresh);
      return fresh.length > 0;
    } : null,
  });
}

/** Send a post's picture(s) or video as files. `ctx` can be a message, a command or a button. */
async function sendMedia(ctx, p, limit = 10 * 1024 * 1024) {
  if (!p.media.length) return plain(ctx, { components: [note('warning', 'That post has no downloadable media.')], flags: MessageFlags.IsComponentsV2, allowedMentions: NO });
  const files = []; let used = 0;
  for (const [n, url] of p.media.slice(0, 4).entries()) {
    const m = await sc.fetchMedia(url, limit - used).catch(() => null);
    if (!m) continue;
    used += m.buffer.length;
    files.push(new AttachmentBuilder(m.buffer, { name: `${p.id || 'media'}-${n + 1}.${m.ext}` }));
  }
  if (!files.length) {
    return plain(ctx, { components: [note('warning', 'That file is too big to upload here.', p.media[0])], flags: MessageFlags.IsComponentsV2, allowedMentions: NO });
  }
  return plain(ctx, { content: [p.author?.username ? `**@${p.author.username}**` : '', p.url ?? ''].filter(Boolean).join('  ·  ') || undefined, files, allowedMentions: NO });
}

/* ── command factory ───────────────────────────────────────────────── */

const cooldown = new Map();

/**
 * subs: [{ name, desc, arg, argDesc, required = true, aliases = [], run(ctx, arg) }]
 * `fallback` (optional): sub-command used when the first word is not one (e.g. `ig natgeo` → profile).
 */
function makeCommand({ name, aliases = [], description, category = 'social', subs, fallback = null, bare = null, help = name, usage }) {
  const data = new SlashCommandBuilder().setName(name).setDescription(description.slice(0, 100));
  for (const s of subs) {
    data.addSubcommand(b => {
      b.setName(s.name).setDescription(s.desc.slice(0, 100));
      if (s.arg) b.addStringOption(o => o.setName(s.arg).setDescription((s.argDesc || s.arg).slice(0, 100)).setRequired(s.required !== false).setMaxLength(300));
      return b;
    });
  }
  const byName = new Map();
  for (const s of subs) { byName.set(s.name, s); for (const a of s.aliases ?? []) byName.set(a, s); }

  async function guarded(ctx, fn) {
    try {
      const uid = userOf(ctx).id, last = cooldown.get(`${name}:${uid}`) ?? 0;
      if (Date.now() - last < 3000) return send(ctx, note('warning', 'Slow down a little.')).catch(() => {});
      cooldown.set(`${name}:${uid}`, Date.now());
      return await fn();
    } catch (e) {
      const known = e instanceof sc.CrawlError || e?.userFacing === true;
      if (!known) console.error(`[${name}]`, e);
      return send(ctx, note('error', known ? e.message : 'Something went wrong while looking that up.')).catch(() => {});
    }
  }

  async function execute(ctx, args = []) {
    if (isSlash(ctx)) {
      if (!ctx.deferred && !ctx.replied) await ctx.deferReply();
      const s = byName.get(ctx.options.getSubcommand());
      return guarded(ctx, () => s.run(ctx, s.arg ? ctx.options.getString(s.arg) ?? '' : ''));
    }
    if (!args.length) {
      const b = bare && byName.get(bare);
      return b ? guarded(ctx, () => b.run(ctx, '')) : require('./helpMenu').showCommand(ctx, help);
    }
    ctx.channel?.sendTyping?.().catch(() => {});
    const first = (args[0] || '').toLowerCase();
    let s = byName.get(first), rest = args.slice(1).join(' ').trim();
    if (!s) { s = fallback ? byName.get(fallback) : null; rest = args.join(' ').trim(); }
    if (!s) return require('./helpMenu').showCommand(ctx, help);
    return guarded(ctx, () => s.run(ctx, rest));
  }

  return { data, slashOptional: true, name, aliases, description, usage: usage ?? `${name} <${subs.map(s => s.name).join('|')}> <…>`, category, execute };
}

/** A short list of accounts. url(a) builds a profile link when the service did not send one. */
function listProfiles(list, { title, color, site, url }) {
  const c = ui.box('base').setAccentColor(color).addTextDisplayComponents(ui.text(`### ${title}`));
  c.addTextDisplayComponents(ui.text(list.slice(0, 10).map((a, i) => {
    const link = a.url || (a.username && url ? url(a.username) : null);
    const nm = clip(a.name || a.username || 'Unknown', 40);
    return `**${i + 1}.** ${link ? `[${nm}](${link})` : nm}${tick(a.verified)}${a.username ? `  @${a.username}` : ''}${a.followers !== null ? `  ·  ${num(a.followers)}` : ''}${a.bio ? `\n${ui.sub(clip(a.bio.replace(/\s+/g, ' '), 90))}` : ''}`;
  }).join('\n')));
  c.addTextDisplayComponents(ui.text(ui.sub(site)));
  return c;
}

const need = (ctx, arg, what, usage) => (arg ? null : send(ctx, note('warning', `${what}?`, usage)));

module.exports = { listProfiles, makeCommand, profileCard, postCard, viewPosts, sendMedia, send, note, need, clip, num, ts, plain };
