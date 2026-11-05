// grace · Last.fm API (https://www.last.fm/api). Free key; the secret is only used to sign `login` and love/unlove.

const crypto = require('crypto');
const config = require('../settings');

const API = 'https://ws.audioscrobbler.com/2.0/';
const L = () => config.LASTFM || {};
const configured = () => !!L().API_KEY;
const canLogin = () => !!(L().API_KEY && L().API_SECRET);

class FmError extends Error { constructor(m, code = 'error') { super(m); this.code = code; } }

const PERIODS = { overall: 'overall', all: 'overall', alltime: 'overall', '7d': '7day', week: '7day', '1w': '7day', '1m': '1month', month: '1month', '3m': '3month', '6m': '6month', '12m': '12month', year: '12month', '1y': '12month' };
const PERIOD_NAMES = { overall: 'all time', '7day': 'past 7 days', '1month': 'past month', '3month': 'past 3 months', '6month': 'past 6 months', '12month': 'past year' };

const cache = new Map();
const TTL = 20_000;

const sign = (params) => crypto.createHash('md5').update(Object.keys(params).sort().map(k => k + params[k]).join('') + L().API_SECRET, 'utf8').digest('hex');

async function call(method, params = {}, { signed = false, post = false, fresh = false } = {}) {
  if (!configured()) throw new FmError('Last.fm is not set up on this bot yet.', 'config');
  let p = { method, api_key: L().API_KEY, ...params };
  for (const k of Object.keys(p)) if (p[k] === undefined || p[k] === null || p[k] === '') delete p[k];
  if (signed) { if (!L().API_SECRET) throw new FmError('Last.fm login is not set up on this bot yet.', 'config'); p.api_sig = sign(p); }
  p.format = 'json';
  const body = new URLSearchParams(p);
  const key = post ? null : `${API}?${body}`;
  if (key && !fresh) { const hit = cache.get(key); if (hit && Date.now() - hit.at < TTL) return hit.json; }

  const res = await (post
    ? fetch(API, { method: 'POST', body, signal: AbortSignal.timeout(15000) })
    : fetch(key, { signal: AbortSignal.timeout(15000) })).catch(() => { throw new FmError('Last.fm took too long to answer.', 'timeout'); });
  const json = await res.json().catch(() => null);
  if (json?.error) {
    const map = {
      6: ['I could not find that on Last.fm.', 'notfound'], 17: ['That profile hides its listening history. They need to turn off "Hide recent listening information" in their Last.fm privacy settings.', 'private'],
      29: ['Last.fm is limiting requests right now. Try again in a moment.', 'limit'], 26: ['The Last.fm key was suspended. The owner needs to check it.', 'auth'],
      10: ['The Last.fm key is not valid. The owner needs to check it.', 'auth'], 4: ['That login link is not valid.', 'token'], 14: ['You have not allowed access yet. Open the link and press Yes, allow access first.', 'token'],
      15: ['That login link expired. Run the login again.', 'token'], 9: ['Your Last.fm login expired. Run `lastfm login` again.', 'session'], 8: ['Last.fm had a hiccup. Try again.', 'down'], 11: ['Last.fm is down right now.', 'down'], 16: ['Last.fm is busy. Try again.', 'down'],
    };
    const [m, code] = map[json.error] ?? [json.message || 'Last.fm answered with an error.', 'error'];
    throw new FmError(m, code);
  }
  if (!res.ok || !json) throw new FmError(`Last.fm answered with an error (${res.status}).`, 'http');
  if (key) { cache.set(key, { at: Date.now(), json }); if (cache.size > 400) cache.delete(cache.keys().next().value); }
  return json;
}

/* ── shaping ───────────────────────────────────────────────────────── */

const BLANK = '2a96cbd8b46e442fc41c2b86b821562f';
const art = (images) => {
  const list = [].concat(images || []).filter(i => i?.['#text'] && !i['#text'].includes(BLANK));
  const big = list.find(i => i.size === 'extralarge') ?? list.find(i => i.size === 'large') ?? list[list.length - 1];
  return big ? big['#text'].replace(/\/(?:34s|64s|174s|300x300)\//, '/300x300/') : null;
};
const num = (v) => Number(v ?? 0) || 0;
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const link = (u) => u || null;

function shapeTrack(t) {
  return {
    name: t.name, url: link(t.url), artist: t.artist?.name ?? t.artist?.['#text'] ?? t.artist ?? null, artistUrl: t.artist?.url ?? null,
    album: t.album?.['#text'] ?? t.album?.title ?? t.album ?? null, art: art(t.image),
    now: t['@attr']?.nowplaying === 'true', at: t.date?.uts ? new Date(Number(t.date.uts) * 1000) : null,
    plays: t.playcount !== undefined ? num(t.playcount) : null, loved: t.loved === '1',
  };
}

async function recent(user, limit = 10) {
  const j = await call('user.getrecenttracks', { user, limit, extended: 0 });
  const r = j.recenttracks ?? {};
  return { tracks: arr(r.track).map(shapeTrack), total: num(r['@attr']?.total), user: r['@attr']?.user ?? user };
}

async function info(user) {
  const u = (await call('user.getinfo', { user })).user;
  return {
    name: u.name, real: u.realname || null, url: u.url, plays: num(u.playcount), artists: u.artist_count !== undefined ? num(u.artist_count) : null,
    tracks: u.track_count !== undefined ? num(u.track_count) : null, albums: u.album_count !== undefined ? num(u.album_count) : null,
    since: u.registered?.unixtime ? new Date(Number(u.registered.unixtime) * 1000) : null, country: u.country && u.country !== 'None' ? u.country : null, avatar: art(u.image), subscriber: u.subscriber === '1',
  };
}

const top = (kind) => async (user, period = 'overall', limit = 50) => {
  const j = await call(`user.gettop${kind}`, { user, period, limit });
  const root = j[`top${kind}`] ?? {};
  return { items: arr(root[kind.slice(0, -1)]).map(x => ({ name: x.name, url: x.url, artist: x.artist?.name ?? null, plays: num(x.playcount), art: art(x.image) })), total: num(root['@attr']?.total) };
};
const topArtists = top('artists'), topTracks = top('tracks'), topAlbums = top('albums');

async function lovedTracks(user, limit = 50) {
  const j = await call('user.getlovedtracks', { user, limit });
  const r = j.lovedtracks ?? {};
  return { tracks: arr(r.track).map(t => ({ ...shapeTrack(t), at: t.date?.uts ? new Date(Number(t.date.uts) * 1000) : null })), total: num(r['@attr']?.total) };
}

async function artistInfo(artist, user) {
  const a = (await call('artist.getinfo', { artist, username: user, autocorrect: 1 })).artist;
  return { name: a.name, url: a.url, listeners: num(a.stats?.listeners), plays: num(a.stats?.playcount), yours: a.stats?.userplaycount !== undefined ? num(a.stats.userplaycount) : null, tags: arr(a.tags?.tag).map(t => t.name).slice(0, 5), bio: (a.bio?.summary || '').replace(/<a [^>]*>.*?<\/a>/gi, '').replace(/<[^>]+>/g, '').trim(), similar: arr(a.similar?.artist).map(s => s.name).slice(0, 5), art: art(a.image) };
}
async function trackInfo(artist, track, user) {
  const t = (await call('track.getinfo', { artist, track, username: user, autocorrect: 1 })).track;
  return { name: t.name, url: t.url, artist: t.artist?.name, artistUrl: t.artist?.url, album: t.album?.title ?? null, art: art(t.album?.image), listeners: num(t.listeners), plays: num(t.playcount), yours: t.userplaycount !== undefined ? num(t.userplaycount) : null, loved: t.userloved === '1', tags: arr(t.toptags?.tag).map(x => x.name).slice(0, 5), duration: num(t.duration) / 1000 };
}
async function albumInfo(artist, album, user) {
  const a = (await call('album.getinfo', { artist, album, username: user, autocorrect: 1 })).album;
  return { name: a.name, url: a.url, artist: a.artist, art: art(a.image), listeners: num(a.listeners), plays: num(a.playcount), yours: a.userplaycount !== undefined ? num(a.userplaycount) : null, tags: arr(a.tags?.tag).map(x => x.name).slice(0, 5), tracks: arr(a.tracks?.track).length };
}

/* ── login + love ──────────────────────────────────────────────────── */

const getToken = async () => (await call('auth.getToken', {}, { signed: true, fresh: true })).token;
const authUrl = (token) => `https://www.last.fm/api/auth/?api_key=${L().API_KEY}&token=${token}`;
async function getSession(token) { const s = (await call('auth.getSession', { token }, { signed: true, fresh: true })).session; return { username: s.name, key: s.key }; }
const love = (sk, artist, track) => call('track.love', { artist, track, sk }, { signed: true, post: true });
const unlove = (sk, artist, track) => call('track.unlove', { artist, track, sk }, { signed: true, post: true });

module.exports = { FmError, configured, canLogin, PERIODS, PERIOD_NAMES, recent, info, topArtists, topTracks, topAlbums, lovedTracks, artistInfo, trackInfo, albumInfo, getToken, authUrl, getSession, love, unlove, art };
