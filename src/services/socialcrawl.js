// grace · SocialCrawl client (socialcrawl.dev). One key, many platforms, one response shape.
//   GET https://www.socialcrawl.dev/v1/<platform>/<resource>  with header x-api-key
//   Profiles come back as data.author, posts as a Post object, lists as items[] + pagination.

const config = require('../settings');

const BASE = 'https://www.socialcrawl.dev/v1';
const KEY = () => config.SOCIALCRAWL?.API_KEY;
const configured = () => !!KEY();

class CrawlError extends Error { constructor(m, code = 'error') { super(m); this.code = code; } }

const cache = new Map();                 // identical lookups within 10 minutes cost nothing
const TTL = 10 * 60_000;
let credits = null;

async function call(path, params = {}, { fresh = false } = {}) {
  if (!configured()) throw new CrawlError('Social lookups are not set up on this bot yet.', 'config');
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
  const url = `${BASE}${path}?${q}`;
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.json;

  const res = await fetch(url, { headers: { 'x-api-key': KEY() }, signal: AbortSignal.timeout(30000) })
    .catch(() => { throw new CrawlError('The social service took too long to answer.', 'timeout'); });
  const json = await res.json().catch(() => null);
  if (json?.credits_remaining !== undefined) credits = json.credits_remaining;

  if (!res.ok || json?.success === false) {
    const t = json?.error?.type;
    const map = {
      MISSING_API_KEY: ['The social service key is missing.', 'auth'], INVALID_API_KEY: ['The social service key was rejected. The owner needs to check it.', 'auth'],
      INSUFFICIENT_CREDITS: ['The bot is out of social lookup credits. The owner needs to top up.', 'credits'],
      RESOURCE_NOT_FOUND: ['I could not find that. Check the spelling or link.', 'notfound'], ENDPOINT_NOT_FOUND: ['That lookup is not available.', 'notfound'],
      INVALID_REQUEST: ['That does not look like a valid name or link.', 'bad'], CONCURRENCY_LIMIT: ['Too many lookups at once. Try again in a moment.', 'limit'],
    };
    const [m, code] = map[t] ?? (res.status === 404 ? map.RESOURCE_NOT_FOUND : [`The social service answered with an error (${res.status}).`, 'http']);
    throw new CrawlError(m, code);
  }
  cache.set(url, { at: Date.now(), json });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return json;
}

/* ── reading the unified shapes (tolerant: fields may be null or missing) ── */

const clean = (s) => (typeof s === 'string' ? s.trim() : s ?? null);
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function author(a) {
  if (!a) return null;
  return {
    id: a.id ?? null, username: a.username ?? null, name: a.display_name ?? a.username ?? null, avatar: a.avatar_url ?? null,
    bio: clean(a.bio), verified: !!a.verified, followers: a.followers ?? null, following: a.following ?? null, posts: a.posts_count ?? null,
    likes: a.likes_count ?? null, url: a.url ?? null, location: a.location ?? null, link: a.external_url ?? null, private: !!a.private,
    joined: a.joined_at ? new Date(a.joined_at) : null, ext: a.ext ?? {},
  };
}

function post(x) {
  const p = x?.post ?? x?.comment ?? x;
  if (!p || typeof p !== 'object') return null;
  const c = p.content ?? {}, e = p.engagement ?? {};
  const media = arr(c.media_urls).filter(u => typeof u === 'string');
  return {
    id: p.id != null ? String(p.id) : null, url: p.url ?? null,
    title: clean(c.title) ?? clean(p.title) ?? null, text: clean(c.text) ?? clean(p.text) ?? null,
    media, thumb: c.thumbnail_url ?? null, duration: c.duration_seconds ?? null,
    views: e.views ?? null, likes: e.likes ?? e.upvotes ?? null, comments: e.comments ?? e.replies ?? null, shares: e.shares ?? null, saves: e.saves ?? null,
    published: p.published_at ? new Date(p.published_at) : null, author: author(p.author), pinned: !!p.flags?.pinned, ext: p.ext ?? {},
  };
}

/** Pull the list of rows out of a response, wherever the service put it. */
function rows(r) {
  const d = r?.data;
  const list = r?.items ?? d?.items ?? d?.posts ?? d?.results ?? (Array.isArray(d) ? d : []);
  return arr(list);
}
function cursor(r) {
  const pg = r?.pagination ?? r?.data?.pagination ?? {};
  const next = pg.next_cursor ?? r?.next_cursor ?? r?.data?.next_cursor ?? null;
  return next && pg.has_more !== false ? next : null;
}
const posts = (r) => rows(r).map(post).filter(Boolean);
const authors = (r) => rows(r).map(x => author(x?.author ?? x)).filter(Boolean);
const profile = (r) => author(r?.data?.author ?? r?.data);
const onePost = (r) => post(r?.data?.post ?? r?.data);

/** Download a media file for upload. Returns null when it is bigger than `max` bytes. */
async function fetchMedia(url, max = 10 * 1024 * 1024) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > max) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) return null;
  const type = res.headers.get('content-type') || '';
  const ext = /mp4|video/.test(type) ? 'mp4' : /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /gif/.test(type) ? 'gif' : /jpe?g|image/.test(type) ? 'jpg' : (url.match(/\.(mp4|jpe?g|png|webp|gif)(?:\?|$)/i)?.[1] ?? 'mp4');
  return { buffer: buf, ext };
}

/** Pull a bare handle out of @name, a profile link or plain text. */
const handle = (s) => {
  let v = String(s || '').trim();
  v = v.replace(/^https?:\/\/(?:www\.|m\.|mobile\.)?(?:instagram\.com|tiktok\.com|twitter\.com|x\.com)\//i, '').replace(/^@/, '');
  return v.split(/[/?#\s]/)[0].replace(/^@/, '');
};

module.exports = { CrawlError, configured, call, author, post, rows, cursor, posts, authors, profile, onePost, fetchMedia, handle, credits: () => credits };
