// grace · Pinterest client. Uses the same public JSON endpoints the website uses, so no key is needed.
// If Pinterest blocks your host, set PINTEREST_COOKIE in .env (the value of a _pinterest_sess cookie).

const config = require('../settings');

const BASE = 'https://www.pinterest.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const cache = new Map();            // url -> { ts, val }
const TTL = 10 * 60_000;
setInterval(() => { const n = Date.now(); for (const [k, v] of cache) if (n - v.ts > TTL) cache.delete(k); }, 5 * 60_000).unref?.();

class PinterestError extends Error {
  constructor(message, code = 'error') { super(message); this.code = code; }
}

function headers() {
  const h = {
    'User-Agent': UA, Accept: 'application/json, text/javascript, */*, q=0.01', 'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest', 'X-Pinterest-AppState': 'active', 'X-Pinterest-PWS-Handler': 'www/index.js', Referer: `${BASE}/`,
  };
  const cookie = config.PINTEREST?.COOKIE;
  if (cookie) h.Cookie = cookie.includes('=') ? cookie : `_pinterest_sess=${cookie}`;
  return h;
}

/** Call a Pinterest resource. @returns { data, bookmark } */
async function resource(name, options, sourceUrl = '/') {
  const data = JSON.stringify({ options, context: {} });
  const url = `${BASE}/resource/${name}Resource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(data)}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.ts < TTL) return hit.val;

  let res;
  try { res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(15000) }); }
  catch { throw new PinterestError('Pinterest took too long to answer.', 'timeout'); }

  if (res.status === 404) throw new PinterestError('Pinterest could not find that.', 'notfound');
  if (res.status === 403 || res.status === 429) throw new PinterestError('Pinterest is limiting requests right now. Try again in a minute.', 'blocked');
  if (!res.ok) throw new PinterestError(`Pinterest answered with an error (${res.status}).`, 'http');

  const json = await res.json().catch(() => null);
  const out = json?.resource_response;
  if (!out) throw new PinterestError('Pinterest sent something I could not read.', 'parse');
  if (out.status === 'failure' || out.error) {
    const notFound = /not.?found|does not exist|private/i.test(JSON.stringify(out.error ?? ''));
    throw new PinterestError(notFound ? 'Pinterest could not find that, or it is private.' : 'Pinterest refused the request.', notFound ? 'notfound' : 'refused');
  }
  const val = { data: out.data, bookmark: out.bookmark && out.bookmark !== '-end-' ? out.bookmark : null };
  cache.set(url, { ts: Date.now(), val });
  return val;
}

/* ── shaping ───────────────────────────────────────────────────────── */

const best = (images) => images?.orig ?? images?.['736x'] ?? images?.['474x'] ?? images?.['236x'] ?? null;

function pickVideo(p) {
  const list = p.videos?.video_list ?? p.story_pin_data?.pages?.[0]?.blocks?.find(b => b.video)?.video?.video_list;
  if (!list) return null;
  const order = ['V_EXP7', 'V_720P', 'V_EXP6', 'V_EXP5', 'V_EXP4', 'V_EXP3', 'V_480P', 'V_360P'];
  for (const k of order) if (list[k]?.url && /\.mp4/i.test(list[k].url)) return list[k].url;
  return Object.values(list).find(v => /\.mp4/i.test(v?.url ?? ''))?.url ?? null;
}

function shapePin(p) {
  if (!p?.id) return null;
  const img = best(p.images) ?? best(p.story_pin_data?.pages?.[0]?.blocks?.find(b => b.image)?.image?.images);
  const board = p.board;
  const who = p.pinner ?? p.native_creator ?? p.origin_pinner;
  return {
    id: String(p.id),
    title: (p.grid_title || p.title || '').trim(),
    desc: (p.description || p.seo_alt_text || p.auto_alt_text || '').replace(/\s+/g, ' ').trim(),
    image: img?.url ?? null,
    width: img?.width ?? null, height: img?.height ?? null,
    video: pickVideo(p),
    author: who ? { username: who.username, name: who.full_name || who.username, avatar: who.image_medium_url || who.image_small_url || null } : null,
    board: board?.name ? { name: board.name, url: board.url ? `${BASE}${board.url}` : null } : null,
    link: p.link || null,
    domain: p.domain || null,
    saves: p.repin_count ?? p.aggregated_pin_data?.aggregated_stats?.saves ?? null,
    comments: p.comment_count ?? p.aggregated_pin_data?.comment_count ?? null,
    created: p.created_at ? new Date(p.created_at) : null,
    color: /^#[0-9a-f]{6}$/i.test(p.dominant_color ?? '') ? parseInt(p.dominant_color.slice(1), 16) : null,
    url: `${BASE}/pin/${p.id}/`,
  };
}

function shapeUser(u) {
  if (!u?.username) return null;
  return {
    username: u.username, name: u.full_name || u.username, about: (u.about || '').trim(),
    avatar: u.image_xlarge_url || u.image_large_url || u.image_medium_url || null,
    cover: u.profile_cover?.images?.original?.url ?? u.profile_cover?.image_url ?? null,
    followers: u.follower_count ?? null, following: u.following_count ?? null,
    pins: u.pin_count ?? null, boards: u.board_count ?? u.boards_count ?? null,
    monthly: u.profile_views ?? u.monthly_views ?? null,
    website: u.website_url || u.domain_url || null,
    verified: !!(u.verified_identity && Object.keys(u.verified_identity).length) || !!u.is_verified_merchant,
    url: `${BASE}/${u.username}/`,
  };
}

function shapeBoard(b) {
  if (!b?.id) return null;
  return {
    id: String(b.id), name: b.name, desc: (b.description || '').trim(), pins: b.pin_count ?? null, followers: b.follower_count ?? null,
    owner: b.owner?.username ?? null, url: b.url ? `${BASE}${b.url}` : null, secret: b.privacy === 'secret',
    cover: b.image_cover_url || best(b.images)?.url || null,
  };
}

const pinsOf = (arr) => (Array.isArray(arr) ? arr : arr?.results ?? []).filter(x => x && (x.type === 'pin' || x.images || x.videos)).map(shapePin).filter(p => p && (p.image || p.video));

/* ── input parsing ─────────────────────────────────────────────────── */

/** A pin id from a link, a pin.it short link, or the id itself. */
async function parsePinId(input) {
  const text = String(input || '').trim();
  if (/^\d{6,}$/.test(text)) return text;
  const m = text.match(/pinterest\.[a-z.]+\/pin\/(?:[^/]*--)?(\d+)/i);
  if (m) return m[1];
  if (/pin\.it\/[\w-]+/i.test(text)) {
    try {
      const res = await fetch(text.match(/https?:\/\/\S+/)?.[0] ?? `https://${text}`, { redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
      const mm = res.url.match(/\/pin\/(?:[^/]*--)?(\d+)/);
      if (mm) return mm[1];
    } catch { /* fall through */ }
  }
  return null;
}

/** { username, slug } from `user/board`, or a board link. */
function parseBoard(input) {
  const text = String(input || '').trim().replace(/[?#].*$/, '');
  const m = text.match(/pinterest\.[a-z.]+\/([^/]+)\/([^/]+)/i) || text.match(/^([\w.-]+)\/([\w.%-]+)$/);
  if (!m || ['pin', 'search', 'ideas', 'today'].includes(m[1].toLowerCase())) return null;
  return { username: m[1], slug: decodeURIComponent(m[2]) };
}

const cleanUser = (s) => String(s || '').trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?pinterest\.[a-z.]+\//i, '').split(/[/?#]/)[0];

/* ── calls ─────────────────────────────────────────────────────────── */

async function search(query, bookmark = null) {
  const q = String(query).slice(0, 200);
  const r = await resource('BaseSearch', { query: q, scope: 'pins', page_size: 25, no_fetch_context_on_resource: false, ...(bookmark ? { bookmarks: [bookmark] } : {}) }, `/search/pins/?q=${encodeURIComponent(q)}`);
  return { pins: pinsOf(r.data), bookmark: r.bookmark };
}

async function pin(id) {
  const r = await resource('Pin', { id, field_set_key: 'detailed' }, `/pin/${id}/`);
  const p = shapePin(r.data);
  if (!p) throw new PinterestError('Pinterest could not find that pin.', 'notfound');
  return p;
}

async function related(id, bookmark = null) {
  const r = await resource('RelatedPinFeed', { pin: id, page_size: 25, add_vase: true, ...(bookmark ? { bookmarks: [bookmark] } : {}) }, `/pin/${id}/`);
  return { pins: pinsOf(r.data), bookmark: r.bookmark };
}

async function user(username) {
  const u = cleanUser(username);
  if (!u) throw new PinterestError('Give me a username.', 'notfound');
  const r = await resource('User', { username: u, field_set_key: 'profile' }, `/${u}/`);
  const out = shapeUser(r.data);
  if (!out) throw new PinterestError('Pinterest could not find that profile.', 'notfound');
  return out;
}

async function userPins(username, bookmark = null) {
  const u = cleanUser(username);
  const r = await resource('UserActivityPins', { username: u, field_set_key: 'grid_item', page_size: 25, ...(bookmark ? { bookmarks: [bookmark] } : {}) }, `/${u}/_created/`);
  return { pins: pinsOf(r.data), bookmark: r.bookmark };
}

async function userBoards(username, bookmark = null) {
  const u = cleanUser(username);
  const r = await resource('Boards', { username: u, field_set_key: 'profile_grid_item', sort: 'last_pinned_to', page_size: 25, ...(bookmark ? { bookmarks: [bookmark] } : {}) }, `/${u}/`);
  const list = (Array.isArray(r.data) ? r.data : []).map(shapeBoard).filter(b => b && !b.secret);
  return { boards: list, bookmark: r.bookmark };
}

async function board(username, slug) {
  const r = await resource('Board', { username: cleanUser(username), slug, field_set_key: 'detailed' }, `/${username}/${slug}/`);
  const b = shapeBoard(r.data);
  if (!b) throw new PinterestError('Pinterest could not find that board.', 'notfound');
  return b;
}

async function boardPins(boardId, bookmark = null, source = '/') {
  const r = await resource('BoardFeed', { board_id: boardId, page_size: 25, field_set_key: 'react_grid_pin', ...(bookmark ? { bookmarks: [bookmark] } : {}) }, source);
  return { pins: pinsOf(r.data), bookmark: r.bookmark };
}

/** Download a pin's media. @returns { buffer, ext, kind } or null when it is too big */
async function fetchMedia(p, limit = 24 * 1024 * 1024) {
  const url = p.video || (p.image ? p.image.replace(/\/\d+x\//, '/originals/') : null);
  for (const u of [url, p.image].filter(Boolean)) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA, Referer: `${BASE}/` }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const len = Number(res.headers.get('content-length') || 0);
      if (len > limit) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > limit) return null;
      const type = res.headers.get('content-type') || '';
      const ext = type.includes('mp4') || /\.mp4/i.test(u) ? 'mp4' : type.includes('gif') ? 'gif' : type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      return { buffer, ext, kind: ext === 'mp4' ? 'video' : 'image' };
    } catch { /* try the next one */ }
  }
  return null;
}

module.exports = { PinterestError, search, pin, related, user, userPins, userBoards, board, boardPins, fetchMedia, parsePinId, parseBoard, cleanUser, BASE };
