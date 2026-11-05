// grace · Twitch Helix (official API). Free; needs a Client ID and Secret from dev.twitch.tv/console.
// Everything here works with an app access token, so no one has to log in.

const config = require('../settings');

const API = 'https://api.twitch.tv/helix';
const T = () => config.TWITCH || {};
const configured = () => !!(T().CLIENT_ID && T().CLIENT_SECRET);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class TwitchError extends Error { constructor(m, code = 'error') { super(m); this.code = code; } }

/* ── token ─────────────────────────────────────────────────────────── */

let token = null, tokenExp = 0, tokenWait = null;
async function getToken(force = false) {
  if (!force && token && Date.now() < tokenExp - 60_000) return token;
  if (tokenWait) return tokenWait;
  tokenWait = (async () => {
    const q = new URLSearchParams({ client_id: T().CLIENT_ID, client_secret: T().CLIENT_SECRET, grant_type: 'client_credentials' });
    const res = await fetch(`https://id.twitch.tv/oauth2/token?${q}`, { method: 'POST', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new TwitchError('Twitch refused the bot\'s keys. Check TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.', 'auth');
    const j = await res.json();
    token = j.access_token; tokenExp = Date.now() + (j.expires_in ?? 3600) * 1000;
    return token;
  })().finally(() => { tokenWait = null; });
  return tokenWait;
}

/** GET a Helix endpoint. params may hold arrays (repeated keys). @returns { data, pagination } */
async function api(path, params = {}, { retried = false } = {}) {
  if (!configured()) throw new TwitchError('Twitch is not set up on this bot yet.', 'config');
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    for (const one of [].concat(v)) q.append(k, String(one));
  }
  const res = await fetch(`${API}${path}?${q}`, {
    headers: { 'Client-Id': T().CLIENT_ID, Authorization: `Bearer ${await getToken(retried)}` },
    signal: AbortSignal.timeout(15000),
  }).catch(() => { throw new TwitchError('Twitch took too long to answer.', 'timeout'); });

  if (res.status === 401 && !retried) return api(path, params, { retried: true });
  if (res.status === 429) { if (!retried) { await sleep(2000); return api(path, params, { retried: true }); } throw new TwitchError('Twitch is limiting requests right now. Try again in a moment.', 'limit'); }
  if (res.status === 404) throw new TwitchError('Twitch could not find that.', 'notfound');
  if (res.status === 400) throw new TwitchError('Twitch did not understand that name.', 'bad');
  if (!res.ok) throw new TwitchError(`Twitch answered with an error (${res.status}).`, 'http');
  const j = await res.json();
  return { data: j.data ?? [], pagination: j.pagination?.cursor ?? null, total: j.total };
}

/* ── shaping ───────────────────────────────────────────────────────── */

const img = (url, w, h) => (url ? url.replace('{width}', w).replace('{height}', h) : null);
const login = (s) => String(s || '').trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.|m\.)?twitch\.tv\//i, '').split(/[/?#\s]/)[0].toLowerCase();
const validLogin = (s) => /^[a-z0-9_]{1,25}$/.test(s);

const shapeUser = (u) => u && ({
  id: u.id, login: u.login, name: u.display_name, type: u.broadcaster_type || null, staff: u.type || null,
  about: (u.description || '').trim(), avatar: u.profile_image_url, banner: u.offline_image_url || null,
  created: new Date(u.created_at), url: `https://www.twitch.tv/${u.login}`,
});

const shapeStream = (s) => s && ({
  id: s.id, userId: s.user_id, login: s.user_login, name: s.user_name, game: s.game_name || 'No category', gameId: s.game_id,
  title: (s.title || '').trim(), viewers: s.viewer_count, started: new Date(s.started_at), lang: s.language,
  tags: s.tags ?? [], mature: !!s.is_mature, thumb: img(s.thumbnail_url, 1280, 720), url: `https://www.twitch.tv/${s.user_login}`,
});

const shapeClip = (c) => ({
  id: c.id, url: c.url, title: c.title, creator: c.creator_name, views: c.view_count, duration: Math.round(c.duration),
  created: new Date(c.created_at), thumb: c.thumbnail_url, game: c.game_id, broadcaster: c.broadcaster_name, vod: c.vod_offset,
});

const shapeVideo = (v) => ({
  id: v.id, url: v.url, title: v.title, views: v.view_count, duration: v.duration, created: new Date(v.created_at),
  thumb: img(v.thumbnail_url, 1280, 720), type: v.type, user: v.user_name,
});

const shapeGame = (g) => g && ({ id: g.id, name: g.name, art: img(g.box_art_url, 285, 380), url: `https://www.twitch.tv/directory/category/${encodeURIComponent(g.name.toLowerCase().replace(/\s+/g, '-'))}` });

/* ── calls ─────────────────────────────────────────────────────────── */

async function user(name) {
  const l = login(name);
  if (!validLogin(l)) throw new TwitchError('That is not a valid Twitch username.', 'bad');
  const r = await api('/users', { login: l });
  const u = shapeUser(r.data[0]);
  if (!u) throw new TwitchError(`There is no Twitch channel called **${l}**.`, 'notfound');
  return u;
}

async function channelInfo(id) {
  const r = await api('/channels', { broadcaster_id: id });
  const c = r.data[0];
  return c ? { title: c.title, game: c.game_name, lang: c.broadcaster_language, tags: c.tags ?? [] } : null;
}

async function stream(userId) {
  const r = await api('/streams', { user_id: userId });
  return shapeStream(r.data[0]) ?? null;
}

/** Live status for many ids at once (100 per call). @returns Map(userId → stream) */
async function liveNow(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await api('/streams', { user_id: ids.slice(i, i + 100), first: 100 });
    for (const s of r.data) out.set(s.user_id, shapeStream(s));
  }
  return out;
}

async function topStreams({ gameId, lang, cursor, first = 20 } = {}) {
  const r = await api('/streams', { first, game_id: gameId, language: lang, after: cursor });
  return { streams: r.data.map(shapeStream), cursor: r.pagination };
}

async function game(name) {
  const r = await api('/games', { name });
  if (r.data[0]) return shapeGame(r.data[0]);
  const s = await api('/search/categories', { query: name, first: 1 });
  return shapeGame(s.data[0]) ?? null;
}

async function topGames(first = 15) {
  const r = await api('/games/top', { first });
  return r.data.map(shapeGame);
}

async function searchChannels(query, { liveOnly = false } = {}) {
  const r = await api('/search/channels', { query, first: 10, live_only: liveOnly || undefined });
  return r.data.map(c => ({ id: c.id, login: c.broadcaster_login, name: c.display_name, live: !!c.is_live, game: c.game_name, title: (c.title || '').trim(), avatar: c.thumbnail_url, url: `https://www.twitch.tv/${c.broadcaster_login}` }));
}

const PERIODS = { day: 1, week: 7, month: 30, year: 365, all: 0 };
async function clips(broadcasterId, period = 'week') {
  const days = PERIODS[period] ?? 7;
  const r = await api('/clips', { broadcaster_id: broadcasterId, first: 20, started_at: days ? new Date(Date.now() - days * 86400000).toISOString() : undefined, ended_at: days ? new Date().toISOString() : undefined });
  return r.data.map(shapeClip);
}

async function videos(userId, type = 'archive') {
  const r = await api('/videos', { user_id: userId, type, first: 20 });
  return r.data.map(shapeVideo);
}

async function schedule(broadcasterId) {
  try {
    const r = await api('/schedule', { broadcaster_id: broadcasterId, first: 8 });
    const d = r.data?.segments ?? r.data?.[0]?.segments ?? [];
    return d.map(s => ({ title: s.title, start: new Date(s.start_time), end: s.end_time ? new Date(s.end_time) : null, category: s.category?.name ?? null, canceled: !!s.canceled_until, recurring: !!s.is_recurring }));
  } catch (e) { if (e.code === 'notfound') return []; throw e; }
}

async function emotes(broadcasterId) {
  const r = await api('/chat/emotes', { broadcaster_id: broadcasterId });
  return r.data.map(e => ({ id: e.id, name: e.name, url: e.images?.url_4x ?? e.images?.url_2x ?? e.images?.url_1x, tier: e.tier || null, kind: e.emote_type }));
}

module.exports = { TwitchError, configured, login, validLogin, user, channelInfo, stream, liveNow, topStreams, game, topGames, searchChannels, clips, videos, schedule, emotes, PERIODS };
