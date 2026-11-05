// grace · ,lastfm  ·  /lastfm   (aliases: fm, lf, wk, whoknows, wkt, wka)
//   fm [user]                       what you are playing (or last played), with your plays
//   recent · topartists · toptracks · topalbums [period] [user]
//   profile [user] · artist · track · album [name]
//   whoknows [artist] (wk) · wkt [track] · wka [album]     who in this server listens to it
//   leaderboard · chart [3x3] [period] · loved [user]
//   love · unlove                    the current track (needs `lastfm login`)
//   set <name> · login · logout      link or unlink your Last.fm

const { SlashCommandBuilder, MessageFlags, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const config = require('../../../settings');
const ui = require('../../../services/ui');
const fm = require('../../../services/lastfm');
const { pager } = require('../../../services/pager');
const { icon, pre } = require('../../../services/icons');
const LastfmUser = require('../../../database/schemas/LastfmUser');

const NO = { parse: [] };
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const n = (v) => Number(v ?? 0).toLocaleString('en');
const ts = (d, f = 'R') => `<t:${Math.floor(d.getTime() / 1000)}:${f}>`;
const isSlash = (ctx) => !!ctx.isChatInputCommand?.();
const userOf = (ctx) => ctx.user ?? ctx.author;
const send = (ctx, comps) => ui.send(ctx, comps, { extra: { allowedMentions: NO } });
const note = (kind, text, footer) => ui.notice(kind, text, footer ? { footer } : {});
const gallery = (u) => new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(u));
const lfUser = (u) => `https://www.last.fm/user/${encodeURIComponent(u)}`;
const prefixOf = (ctx) => ctx.usedPrefix || config.PREFIX;
const md = (name, url) => (url ? `[${name}](${url})` : name);

/* ── who is being looked up ────────────────────────────────────────── */

class Missing extends Error {}

/** @returns { username, discord (user or null), row } or throws Missing */
async function resolve(ctx, token) {
  const me = userOf(ctx);
  const id = token && (token.match(/^<@!?(\d+)>$/)?.[1] ?? (/^\d{15,22}$/.test(token) ? token : null));
  if (id) {
    const row = await LastfmUser.findByPk(id);
    if (!row) throw new Missing(`<@${id}> has not linked a Last.fm account yet.`);
    return { username: row.username, discord: id === me.id ? me : (await ctx.client.users.fetch(id).catch(() => null)), row };
  }
  if (token) return { username: token.replace(/^@/, ''), discord: null, row: null };
  const row = await LastfmUser.findByPk(me.id);
  if (!row) throw new Missing(`<@${me.id}>: Looks like you don't have your username set.\nYou can connect your **Last.fm** using \`${prefixOf(ctx)}lastfm ${fm.canLogin() ? 'login' : 'set <username>'}\``);
  return { username: row.username, discord: me, row };
}

/** Pull a period word and a user out of loose arguments, in any order. */
function parseLoose(args) {
  let period = null; const rest = [];
  for (const a of args) { const p = fm.PERIODS[a.toLowerCase()]; if (p && !period) period = p; else rest.push(a); }
  return { period: period ?? 'overall', user: rest[0] ?? null, rest };
}

/* ── now playing ───────────────────────────────────────────────────── */

async function cmdNowPlaying(ctx, args) {
  const who = await resolve(ctx, args[0]);
  const r = await fm.recent(who.username, 1);
  const t = r.tracks[0];
  if (!t) return send(ctx, note('warning', `**${who.username}** has no scrobbles yet.`));
  const plays = await fm.trackInfo(t.artist, t.name, who.username).catch(() => null);
  const me = userOf(ctx);
  const mine = who.discord?.id === me.id && who.row?.sessionKey;

  const draw = (loved, live = true) => {
    const c = ui.box('base');
    c.addTextDisplayComponents(ui.text(`### ${t.now ? pre('music_playing') : ''}Last.fm: ${who.username}`));
    const body = [
      `**Track**\n${md(clip(t.name, 100), t.url)}`,
      `**Artist**\n${md(clip(t.artist, 80), t.artistUrl || (t.artist ? `https://www.last.fm/music/${encodeURIComponent(t.artist)}` : null))}`,
    ].join('\n');
    c.addSectionComponents(ui.section(body, t.art));
    c.addTextDisplayComponents(ui.text(ui.sub([
      t.now ? 'Now playing' : (t.at ? `Last played ${ts(t.at)}` : null),
      plays?.yours !== null && plays?.yours !== undefined ? `Playcount: ${n(plays.yours)}` : null,
      `Total Scrobbles: ${n(r.total)}`,
      t.album ? `Album: ${clip(t.album, 60)}` : null,
    ].filter(Boolean).join(' • '))));
    const row = [ui.link('Open on Last.fm', t.url || lfUser(who.username))];
    if (mine && live) row.unshift(ui.btn('lfm_love', loved ? 'Loved' : 'Love', { emoji: icon('music_like') || undefined, style: loved ? 'success' : 'secondary' }));
    c.addActionRowComponents(ui.row(...row));
    return c;
  };

  let loved = !!plays?.loved;
  const msg = await send(ctx, draw(loved));
  if (!isSlash(ctx) && msg?.react) { await msg.react('👍').catch(() => {}); await msg.react('👎').catch(() => {}); }
  if (!mine || !msg?.createMessageComponentCollector) return;
  const col = msg.createMessageComponentCollector({ filter: ui.onlyUser(me.id), time: 300000 });
  col.on('collect', async (i) => {
    try {
      if (i.customId !== 'lfm_love') return;
      await (loved ? fm.unlove : fm.love)(who.row.sessionKey, t.artist, t.name);
      loved = !loved;
      await i.update({ components: [draw(loved)], flags: MessageFlags.IsComponentsV2, allowedMentions: NO });
    } catch (e) {
      await i.reply({ components: [note('error', e instanceof fm.FmError ? e.message : 'Could not do that.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
    }
  });
  col.on('end', () => { msg.edit?.({ components: [draw(loved, false)], flags: MessageFlags.IsComponentsV2 }).catch(() => {}); });
}

async function cmdLove(ctx, args, undo) {
  const who = await resolve(ctx, null);
  if (!who.row?.sessionKey) return send(ctx, note('warning', `To ${undo ? 'unlove' : 'love'} tracks I need your Last.fm login.`, fm.canLogin() ? `Run ${prefixOf(ctx)}lastfm login first` : 'Login is not set up on this bot'));
  const t = (await fm.recent(who.username, 1)).tracks[0];
  if (!t) return send(ctx, note('warning', 'You have no scrobbles yet.'));
  await (undo ? fm.unlove : fm.love)(who.row.sessionKey, t.artist, t.name);
  return send(ctx, note('success', `${undo ? 'Removed the heart from' : 'Loved'} **${clip(t.name, 80)}** by **${clip(t.artist, 60)}**.`));
}

/* ── lists ─────────────────────────────────────────────────────────── */

const PAGE = 10;

async function pagedList(ctx, { title, rows, thumb, footer, link }) {
  if (!rows.length) return send(ctx, note('warning', 'Nothing to show yet.'));
  const total = Math.ceil(rows.length / PAGE);
  return pager(ctx, {
    total, user: userOf(ctx), send: (c) => send(ctx, c),
    extra: () => (link ? [ui.link('Open on Last.fm', link)] : []),
    render: (at) => {
      const c = ui.box('base').addTextDisplayComponents(ui.text(`### ${title}`));
      const text = rows.slice(at * PAGE, at * PAGE + PAGE).join('\n');
      const art = thumb?.(at);
      if (art) c.addSectionComponents(ui.section(text, art)); else c.addTextDisplayComponents(ui.text(text));
      c.addTextDisplayComponents(ui.text(ui.sub(`${footer ? footer + ' • ' : ''}Page ${at + 1}/${total} • last.fm`)));
      return c;
    },
  });
}

async function cmdRecent(ctx, args) {
  const who = await resolve(ctx, args[0]);
  const r = await fm.recent(who.username, 50);
  const rows = r.tracks.map((t, i) => `${t.now ? pre('music_playing', '▶ ') : `**${i + 1}.** `}${md(clip(t.name, 60), t.url)} by **${clip(t.artist, 40)}**${t.at ? `  ${ts(t.at)}` : ''}`);
  return pagedList(ctx, { title: `Recent tracks of ${who.username}`, rows, thumb: (at) => r.tracks[at * PAGE]?.art, footer: `${n(r.total)} scrobbles`, link: lfUser(who.username) });
}

const TOPS = {
  artists: { fn: fm.topArtists, label: 'artists', line: (x, i) => `**${i + 1}.** ${md(clip(x.name, 60), x.url)}  ·  ${n(x.plays)} plays` },
  tracks:  { fn: fm.topTracks,  label: 'tracks',  line: (x, i) => `**${i + 1}.** ${md(clip(x.name, 50), x.url)} by **${clip(x.artist, 36)}**  ·  ${n(x.plays)}` },
  albums:  { fn: fm.topAlbums,  label: 'albums',  line: (x, i) => `**${i + 1}.** ${md(clip(x.name, 50), x.url)} by **${clip(x.artist, 36)}**  ·  ${n(x.plays)}` },
};
async function cmdTop(ctx, args, kind) {
  const { period, user } = parseLoose(args);
  const who = await resolve(ctx, user);
  const T = TOPS[kind];
  const r = await T.fn(who.username, period, 50);
  return pagedList(ctx, {
    title: `${who.username}'s top ${T.label}`, rows: r.items.map(T.line), thumb: (at) => r.items[at * PAGE]?.art,
    footer: fm.PERIOD_NAMES[period], link: `${lfUser(who.username)}/library/${kind === 'artists' ? 'artists' : kind === 'albums' ? 'albums' : 'tracks'}`,
  });
}

async function cmdLoved(ctx, args) {
  const who = await resolve(ctx, args[0]);
  const r = await fm.lovedTracks(who.username, 50);
  return pagedList(ctx, { title: `Loved tracks of ${who.username}`, rows: r.tracks.map((t, i) => `**${i + 1}.** ${md(clip(t.name, 60), t.url)} by **${clip(t.artist, 40)}**`), thumb: (at) => r.tracks[at * PAGE]?.art, footer: `${n(r.total)} loved`, link: `${lfUser(who.username)}/loved` });
}

/* ── profile and info cards ────────────────────────────────────────── */

async function cmdProfile(ctx, args) {
  const who = await resolve(ctx, args[0]);
  const [u, ta, np] = await Promise.all([fm.info(who.username), fm.topArtists(who.username, 'overall', 3).catch(() => null), fm.recent(who.username, 1).catch(() => null)]);
  const t = np?.tracks[0];
  const lines = [
    `## ${clip(u.name, 40)}${u.subscriber ? ' ✦' : ''}`,
    u.real ? u.real : '',
    `**${n(u.plays)}** scrobbles`,
    [u.artists !== null ? `**${n(u.artists)}** artists` : null, u.tracks !== null ? `**${n(u.tracks)}** tracks` : null, u.albums !== null ? `**${n(u.albums)}** albums` : null].filter(Boolean).join('  ·  '),
    u.since ? `Scrobbling since ${ts(u.since, 'D')}${u.country ? `  ·  ${u.country}` : ''}` : '',
    ta?.items.length ? `**Top artists:** ${ta.items.map(x => clip(x.name, 30)).join(', ')}` : '',
    t ? `${t.now ? `${pre('music_playing')}Now playing` : 'Last played'}: **${clip(t.name, 50)}** by **${clip(t.artist, 40)}**` : '',
  ].filter(Boolean).join('\n');
  const c = ui.box('base');
  c.addSectionComponents(ui.section(lines, u.avatar || who.discord?.displayAvatarURL?.({ extension: 'png', size: 256 }) || undefined));
  c.addTextDisplayComponents(ui.text(ui.sub('last.fm')));
  c.addActionRowComponents(ui.row(ui.link('Open profile', u.url || lfUser(who.username))));
  return send(ctx, c);
}

const infoCard = ({ title, url, art, lines, footer }) => {
  const c = ui.box('base');
  c.addSectionComponents(ui.section(`## ${md(clip(title, 80), url)}\n${lines.filter(Boolean).join('\n')}`, art || undefined));
  if (footer) c.addTextDisplayComponents(ui.text(ui.sub(footer)));
  if (url) c.addActionRowComponents(ui.row(ui.link('Open on Last.fm', url)));
  return c;
};
const tagLine = (tags) => (tags?.length ? `Tags: ${tags.join(', ')}` : '');

/** "artist - name" or the track the user is playing. */
async function subject(ctx, args, kind) {
  const text = args.join(' ').trim();
  if (text && kind === 'artist') return { artist: text };
  if (text) {
    const [a, ...rest] = text.split(/\s+[-–—]\s+|\s*[|]\s*/);
    if (rest.length) return { artist: a.trim(), name: rest.join(' - ').trim() };
    throw new Missing(`Tell me both: \`${prefixOf(ctx)}lastfm ${kind} artist - ${kind} name\`, or play something and leave it empty.`);
  }
  const who = await resolve(ctx, null);
  const t = (await fm.recent(who.username, 1)).tracks[0];
  if (!t) throw new Missing('You have no scrobbles yet.');
  return { artist: t.artist, name: kind === 'album' ? t.album : t.name, who };
}

async function cmdArtist(ctx, args) {
  const s = await subject(ctx, args, 'artist');
  const who = await resolve(ctx, null).catch(() => null);
  const a = await fm.artistInfo(s.artist, who?.username);
  return send(ctx, infoCard({
    title: a.name, url: a.url, art: a.art,
    lines: [`**${n(a.listeners)}** listeners  ·  **${n(a.plays)}** plays`, a.yours !== null ? `**Your plays:** ${n(a.yours)}` : '', tagLine(a.tags), a.similar.length ? `Similar: ${a.similar.join(', ')}` : '', a.bio ? clip(a.bio, 280) : ''],
    footer: 'last.fm',
  }));
}
async function cmdTrack(ctx, args) {
  const s = await subject(ctx, args, 'track');
  const who = await resolve(ctx, null).catch(() => null);
  const t = await fm.trackInfo(s.artist, s.name, who?.username);
  return send(ctx, infoCard({
    title: t.name, url: t.url, art: t.art,
    lines: [`by **${t.artist}**${t.album ? `  ·  ${t.album}` : ''}`, `**${n(t.listeners)}** listeners  ·  **${n(t.plays)}** plays`, t.yours !== null ? `**Your plays:** ${n(t.yours)}${t.loved ? '  ·  loved' : ''}` : '', tagLine(t.tags)],
    footer: 'last.fm',
  }));
}
async function cmdAlbum(ctx, args) {
  const s = await subject(ctx, args, 'album');
  if (!s.name) throw new Missing('That track has no album on Last.fm. Try `album artist - album name`.');
  const who = await resolve(ctx, null).catch(() => null);
  const a = await fm.albumInfo(s.artist, s.name, who?.username);
  return send(ctx, infoCard({
    title: a.name, url: a.url, art: a.art,
    lines: [`by **${a.artist}**`, `**${n(a.listeners)}** listeners  ·  **${n(a.plays)}** plays`, a.yours !== null ? `**Your plays:** ${n(a.yours)}` : '', tagLine(a.tags)],
    footer: 'last.fm',
  }));
}

/* ── server rankings ───────────────────────────────────────────────── */

async function linkedMembers(ctx, max = 40) {
  const guild = ctx.guild;
  if (!guild) throw new Missing('That only works in a server.');
  const rows = await LastfmUser.findAll();
  const out = [];
  for (const r of rows) {
    const m = guild.members.cache.get(r.userId) ?? (out.length < max ? await guild.members.fetch(r.userId).catch(() => null) : null);
    if (m) out.push({ row: r, member: m });
    if (out.length >= max) break;
  }
  return out;
}
async function pool(items, size, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } }));
  return out;
}
const MEDALS = ['🥇', '🥈', '🥉'];

async function cmdWhoKnows(ctx, args, kind) {
  const s = await subject(ctx, args, kind);
  const me = await resolve(ctx, null).catch(() => null);
  const base = kind === 'artist' ? await fm.artistInfo(s.artist, me?.username) : kind === 'track' ? await fm.trackInfo(s.artist, s.name, me?.username) : await fm.albumInfo(s.artist, s.name, me?.username);
  const members = await linkedMembers(ctx);
  if (!members.length) return send(ctx, note('info', 'Nobody in this server has linked Last.fm yet.', `${prefixOf(ctx)}lastfm ${fm.canLogin() ? 'login' : 'set <username>'}`));
  const got = await pool(members, 8, async (m) => {
    const x = kind === 'artist' ? await fm.artistInfo(base.name, m.row.username) : kind === 'track' ? await fm.trackInfo(base.artist, base.name, m.row.username) : await fm.albumInfo(base.artist, base.name, m.row.username);
    return { name: m.member.displayName, id: m.member.id, user: m.row.username, plays: x.yours ?? 0 };
  });
  const list = got.filter(x => x && x.plays > 0).sort((a, b) => b.plays - a.plays);
  const label = kind === 'artist' ? base.name : `${base.name} by ${base.artist}`;
  const c = ui.box('base').addTextDisplayComponents(ui.text(`### Who knows ${clip(label, 70)} in ${clip(ctx.guild.name, 40)}?`));
  const text = list.length
    ? list.slice(0, 15).map((x, i) => `${MEDALS[i] ?? `**${i + 1}.**`} ${x.id === userOf(ctx).id ? '**' : ''}${md(clip(x.name, 28), lfUser(x.user))}${x.id === userOf(ctx).id ? '**' : ''}  ·  ${n(x.plays)} plays`).join('\n')
    : 'Nobody here has played this yet.';
  if (base.art) c.addSectionComponents(ui.section(text, base.art)); else c.addTextDisplayComponents(ui.text(text));
  const mine = list.findIndex(x => x.id === userOf(ctx).id);
  c.addTextDisplayComponents(ui.text(ui.sub(`${list.length} listener${list.length === 1 ? '' : 's'} • ${n(list.reduce((a, x) => a + x.plays, 0))} plays${mine >= 15 ? ` • you are #${mine + 1}` : ''} • checked ${members.length} linked member${members.length === 1 ? '' : 's'}`)));
  if (base.url) c.addActionRowComponents(ui.row(ui.link('Open on Last.fm', base.url)));
  return send(ctx, c);
}

async function cmdLeaderboard(ctx) {
  const members = await linkedMembers(ctx, 50);
  if (!members.length) return send(ctx, note('info', 'Nobody in this server has linked Last.fm yet.', `${prefixOf(ctx)}lastfm ${fm.canLogin() ? 'login' : 'set <username>'}`));
  const got = await pool(members, 8, async (m) => ({ name: m.member.displayName, id: m.member.id, user: m.row.username, plays: (await fm.info(m.row.username)).plays }));
  const list = got.filter(Boolean).sort((a, b) => b.plays - a.plays);
  const rows = list.map((x, i) => `${MEDALS[i] ?? `**${i + 1}.**`} ${md(clip(x.name, 28), lfUser(x.user))}  ·  ${n(x.plays)} scrobbles`);
  return pagedList(ctx, { title: `Scrobble leaderboard of ${clip(ctx.guild.name, 40)}`, rows, footer: `${list.length} linked` });
}

/* ── chart ─────────────────────────────────────────────────────────── */

async function cmdChart(ctx, args) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  let size = 3; const rest = [];
  for (const a of args) { const m = a.match(/^(\d)x\1$/i); if (m) size = Math.min(6, Math.max(2, Number(m[1]))); else rest.push(a); }
  const { period, user } = parseLoose(rest);
  const who = await resolve(ctx, user);
  const r = await fm.topAlbums(who.username, period, size * size);
  if (!r.items.length) return send(ctx, note('warning', 'Not enough listening history for a chart.'));
  const tile = size <= 4 ? 300 : 220;
  const cv = createCanvas(size * tile, size * tile), g = cv.getContext('2d');
  g.fillStyle = '#1b1b1f'; g.fillRect(0, 0, cv.width, cv.height);
  const imgs = await pool(r.items, 6, async (it) => (it.art ? loadImage(Buffer.from(await (await fetch(it.art, { signal: AbortSignal.timeout(10000) })).arrayBuffer())) : null));
  r.items.forEach((it, i) => {
    const x = (i % size) * tile, y = Math.floor(i / size) * tile;
    if (imgs[i]) g.drawImage(imgs[i], x, y, tile, tile);
    else { g.fillStyle = '#2a2a30'; g.fillRect(x, y, tile, tile); }
    g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(x, y + tile - 34, tile, 34);
    g.fillStyle = '#fff'; g.font = `bold ${tile > 250 ? 14 : 12}px sans-serif`; g.textBaseline = 'middle';
    const fit = (s, w) => { let t = s; while (g.measureText(t).width > w && t.length > 3) t = t.slice(0, -2); return t === s ? s : `${t}…`; };
    g.fillText(fit(it.artist || '', tile - 12), x + 6, y + tile - 24);
    g.font = `${tile > 250 ? 13 : 11}px sans-serif`; g.fillStyle = '#d8d8d8';
    g.fillText(fit(it.name || '', tile - 12), x + 6, y + tile - 9);
  });
  const file = new AttachmentBuilder(await cv.encode('png'), { name: 'chart.png' });
  const c = ui.box('base').addTextDisplayComponents(ui.text(`### ${who.username}'s ${size}x${size} album chart`));
  c.addMediaGalleryComponents(gallery('attachment://chart.png'));
  c.addTextDisplayComponents(ui.text(ui.sub(`${fm.PERIOD_NAMES[period]} • last.fm`)));
  return ui.send(ctx, c, { extra: { files: [file], allowedMentions: NO } });
}

/* ── linking ───────────────────────────────────────────────────────── */

async function cmdSet(ctx, args) {
  const name = (args[0] || '').replace(/^@/, '').replace(/^.*last\.fm\/user\//i, '').split(/[/?#]/)[0];
  if (!name) return send(ctx, note('warning', 'What is your Last.fm username?', `${prefixOf(ctx)}lastfm set <username>`));
  const u = await fm.info(name);                        // proves the account exists
  const me = userOf(ctx);
  const old = await LastfmUser.findByPk(me.id);
  await LastfmUser.upsert({ userId: me.id, username: u.name, sessionKey: old && old.username.toLowerCase() === u.name.toLowerCase() ? old.sessionKey : null });
  return send(ctx, note('success', `Linked to **[${u.name}](${u.url})**. Try \`${prefixOf(ctx)}fm\`.`, 'Run lastfm login as well if you want to love tracks from Discord'));
}

async function cmdLogin(ctx) {
  if (!fm.canLogin()) return send(ctx, note('info', 'Login is not set up on this bot. Link your account by name instead.', `${prefixOf(ctx)}lastfm set <username>`));
  const me = userOf(ctx);
  const token = await fm.getToken();
  const id = `lfm_${Date.now().toString(36)}`;
  const view = (state) => {
    const c = ui.box('base').addTextDisplayComponents(ui.text('### Connect Last.fm'));
    c.addTextDisplayComponents(ui.text(state ?? '1. Press **Authorize on Last.fm** and choose **Yes, allow access**.\n2. Come back here and press **I\'ve authorized**.'));
    if (!state) c.addActionRowComponents(ui.row(ui.link('Authorize on Last.fm', fm.authUrl(token)), ui.btn(`${id}_ok`, 'I\'ve authorized', { style: 'success' })));
    return c;
  };
  // the link is personal: show it only to the person asking where possible
  const msg = await send(ctx, view());
  if (!msg?.createMessageComponentCollector) return;
  const col = msg.createMessageComponentCollector({ filter: ui.onlyUser(me.id), time: 600000 });
  col.on('collect', async (i) => {
    try {
      if (i.customId !== `${id}_ok`) return;
      const s = await fm.getSession(token);
      await LastfmUser.upsert({ userId: me.id, username: s.username, sessionKey: s.key });
      col.stop('done');
      await i.update({ components: [view(`${pre('success')}Connected as **${s.username}**. You can use \`${prefixOf(ctx)}fm\` and love tracks now.`)], flags: MessageFlags.IsComponentsV2, allowedMentions: NO });
    } catch (e) {
      await i.reply({ components: [note('error', e instanceof fm.FmError ? e.message : 'Could not connect.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
    }
  });
  col.on('end', (_, why) => { if (why !== 'done') msg.edit?.({ components: [view('That login link expired. Run the login again.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {}); });
}

async function cmdLogout(ctx) {
  const gone = await LastfmUser.destroy({ where: { userId: userOf(ctx).id } });
  return send(ctx, gone ? note('success', 'Your Last.fm is unlinked and the bot forgot your login.') : note('info', 'You had nothing linked.'));
}

/* ── definition ────────────────────────────────────────────────────── */

const RUN = {
  np: (c, a) => cmdNowPlaying(c, a), recent: cmdRecent, topartists: (c, a) => cmdTop(c, a, 'artists'), toptracks: (c, a) => cmdTop(c, a, 'tracks'), topalbums: (c, a) => cmdTop(c, a, 'albums'),
  profile: cmdProfile, artist: cmdArtist, track: cmdTrack, album: cmdAlbum,
  whoknows: (c, a) => cmdWhoKnows(c, a, 'artist'), wkt: (c, a) => cmdWhoKnows(c, a, 'track'), wka: (c, a) => cmdWhoKnows(c, a, 'album'),
  leaderboard: cmdLeaderboard, chart: cmdChart, loved: cmdLoved, love: (c, a) => cmdLove(c, a, false), unlove: (c, a) => cmdLove(c, a, true),
  set: cmdSet, login: cmdLogin, logout: cmdLogout,
};
const ALIAS = {
  fm: 'np', nowplaying: 'np', now: 'np', current: 'np', recent: 'recent', rt: 'recent', last: 'recent',
  topartists: 'topartists', ta: 'topartists', artists: 'topartists', toptracks: 'toptracks', tracks: 'toptracks', tl: 'toptracks', topalbums: 'topalbums', albums: 'topalbums', talb: 'topalbums',
  profile: 'profile', me: 'profile', user: 'profile', stats: 'profile', artist: 'artist', ar: 'artist', track: 'track', song: 'track', album: 'album', al: 'album',
  whoknows: 'whoknows', wk: 'whoknows', wkt: 'wkt', whoknowstrack: 'wkt', wka: 'wka', whoknowsalbum: 'wka',
  leaderboard: 'leaderboard', lb: 'leaderboard', top: 'leaderboard', chart: 'chart', collage: 'chart', grid: 'chart', loved: 'loved', likes: 'loved', love: 'love', unlove: 'unlove',
  set: 'set', link: 'set', username: 'set', login: 'login', connect: 'login', logout: 'logout', unlink: 'logout', remove: 'logout',
};
const ENTRY = { fm: 'np', wk: 'whoknows', whoknows: 'whoknows', wkt: 'wkt', wka: 'wka' };      // what a bare alias does

const SUBS = [
  ['nowplaying', 'What you are listening to', 'user', 'Member or Last.fm name'], ['recent', 'Recent tracks', 'user', 'Member or Last.fm name'],
  ['topartists', 'Top artists', 'options', 'Period (7d, 1m, 3m, 6m, 12m, overall) and/or a member'], ['toptracks', 'Top tracks', 'options', 'Period and/or a member'], ['topalbums', 'Top albums', 'options', 'Period and/or a member'],
  ['profile', 'Last.fm profile', 'user', 'Member or Last.fm name'], ['artist', 'About an artist', 'name', 'Artist (empty = what you play)'], ['track', 'About a track', 'name', 'artist - track (empty = what you play)'], ['album', 'About an album', 'name', 'artist - album (empty = what you play)'],
  ['whoknows', 'Who in this server plays an artist', 'artist', 'Artist (empty = what you play)'], ['leaderboard', 'Top scrobblers in this server'],
  ['chart', 'Album chart picture', 'options', 'Size like 3x3 and/or a period'], ['loved', 'Loved tracks', 'user', 'Member or Last.fm name'],
  ['love', 'Love the track you are playing'], ['unlove', 'Remove the heart from it'], ['set', 'Link your Last.fm by name', 'username', 'Your Last.fm username', true], ['login', 'Connect your Last.fm account'], ['logout', 'Unlink your Last.fm'],
];
const data = new SlashCommandBuilder().setName('lastfm').setDescription('Last.fm: now playing, top lists, who knows and more');
for (const [name, desc, opt, od, req] of SUBS) data.addSubcommand(s => { s.setName(name).setDescription(desc); if (opt) s.addStringOption(o => o.setName(opt).setDescription(od).setRequired(!!req).setMaxLength(100)); return s; });
const SLASH_KEY = { nowplaying: 'np' };

async function guarded(ctx, fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof Missing) return send(ctx, note('warning', e.message)).catch(() => {});
    const known = e instanceof fm.FmError;
    if (!known) console.error('[lastfm]', e);
    return send(ctx, note('error', !fm.configured() ? 'Last.fm is not set up on this bot yet. The owner needs to add `LASTFM_API_KEY`.' : known ? e.message : 'Something went wrong while talking to Last.fm.')).catch(() => {});
  }
}

module.exports = {
  data,
  slashOptional: true,

  name: 'lastfm',
  aliases: ['fm', 'lf', 'wk', 'whoknows', 'wkt', 'wka'],
  description: 'Last.fm: now playing, top lists, who knows and more',
  usage: 'lastfm <set|login|fm|recent|topartists|toptracks|topalbums|profile|whoknows|chart|…>',
  category: 'social',

  async execute(ctx, args = []) {
    if (isSlash(ctx)) {
      if (!ctx.deferred && !ctx.replied) await ctx.deferReply();
      const sub = ctx.options.getSubcommand();
      const [, , opt] = SUBS.find(x => x[0] === sub);
      const raw = opt ? (ctx.options.getString(opt) ?? '') : '';
      const list = raw.split(/\s+/).filter(Boolean);
      const key = SLASH_KEY[sub] ?? sub;
      return guarded(ctx, () => RUN[key](ctx, ['artist', 'track', 'album'].includes(sub) || key === 'whoknows' ? (raw ? [raw] : []) : list));
    }

    const used = (ctx.invokedAs || '').split(' ')[0].toLowerCase();
    const entry = ENTRY[used];
    const first = (args[0] || '').toLowerCase();
    if (!entry && !args.length) return require('../../../services/helpMenu').showCommand(ctx, 'lastfm');
    ctx.channel?.sendTyping?.().catch(() => {});

    let key, rest;
    if (entry) {
      const named = ALIAS[first];
      // `fm toptracks` also works; otherwise everything after the alias belongs to the entry command
      if (named && (used === 'fm') && !['whoknows', 'wkt', 'wka'].includes(named)) { key = named; rest = args.slice(1); } else { key = entry; rest = args; }
    } else { key = ALIAS[first]; rest = args.slice(1); }
    if (!key) return require('../../../services/helpMenu').showCommand(ctx, 'lastfm');
    return guarded(ctx, () => RUN[key](ctx, rest));
  },
};
