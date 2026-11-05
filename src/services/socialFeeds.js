// grace · new-post alerts. One adapter per platform:
//   resolve(arg) → { key, name, url, avatar }   find the account and its stable id
//   fetch(key)   → [{ id, title, text, url, thumb, at, author }]  newest first
// YouTube and Reddit read free public feeds. Instagram, TikTok and X use SocialCrawl (1 lookup per check).

const sc = require('./socialcrawl');

class FeedError extends Error {}

const UA = 'Mozilla/5.0 (compatible; grace-bot/1.0; +https://discord.com)';
const decode = (s) => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : null; };
const attr = (xml, name, a) => xml.match(new RegExp(`<${name}\\s[^>]*?${a}="([^"]*)"`))?.[1] ?? null;
const entries = (xml) => xml.split('<entry>').slice(1).map(e => e.split('</entry>')[0]);
const ms = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en', ...headers }, signal: AbortSignal.timeout(15000), redirect: 'follow' }).catch(() => null);
  return res;
}

/* ── YouTube ───────────────────────────────────────────────────────── */

const ytFeed = async (id) => {
  const res = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  if (!res || res.status === 404) throw new FeedError('I could not find that YouTube channel.');
  if (!res.ok) throw new FeedError(`YouTube answered with an error (${res.status}).`);
  return res.text();
};

const youtube = {
  label: 'YouTube', verb: 'uploaded a new video', button: 'Watch', free: true, interval: 5 * 60_000, limit: 15,
  async resolve(arg) {
    const t = String(arg || '').trim();
    let id = t.match(/youtube\.com\/channel\/(UC[\w-]{20,})/i)?.[1] ?? (/^UC[\w-]{20,}$/.test(t) ? t : null);
    if (!id) {
      const h = t.match(/youtube\.com\/@([\w.-]+)/i)?.[1] ?? t.replace(/^@/, '').split(/[\s/?#]/)[0];
      if (!h) throw new FeedError('Give me a channel @handle or link.');
      const page = await get(`https://www.youtube.com/@${encodeURIComponent(h)}`, { cookie: 'CONSENT=YES+1; SOCS=CAI' });
      if (page?.ok) {
        const html = await page.text();
        id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{20,})"/)?.[1] ?? html.match(/"(?:externalId|channelId)":"(UC[\w-]{20,})"/)?.[1] ?? null;
      }
      if (!id && sc.configured()) { const a = sc.profile(await sc.call('/youtube/channel', { handle: h }).catch(() => null)); if (a?.id?.startsWith('UC')) id = a.id; }
      if (!id) throw new FeedError('I could not find that YouTube channel. Try its channel link.');
    }
    const xml = await ytFeed(id);
    return { key: id, name: tag(xml.split('<entry>')[0], 'title') ?? id, url: `https://www.youtube.com/channel/${id}`, avatar: null };
  },
  async fetch(id) {
    const xml = await ytFeed(id);
    const who = tag(xml.split('<entry>')[0], 'title');
    return entries(xml).map(e => ({
      id: tag(e, 'yt:videoId'), title: tag(e, 'title'), text: null, url: attr(e, 'link', 'href'), thumb: attr(e, 'media:thumbnail', 'url'),
      at: ms(tag(e, 'published')), author: who,
    })).filter(x => x.id);
  },
};

/* ── Reddit ────────────────────────────────────────────────────────── */

const reddit = {
  label: 'Reddit', verb: 'has a new post', button: 'Open post', free: true, interval: 10 * 60_000, limit: 10,
  async resolve(arg) {
    const k = String(arg || '').trim().replace(/^https?:\/\/(?:www\.|old\.)?reddit\.com\//i, '').replace(/^\/?r\//i, '').split(/[/?#\s]/)[0];
    if (!/^[A-Za-z0-9_]{2,21}$/.test(k)) throw new FeedError('Give me a subreddit name, like `memes` or `r/memes`.');
    const items = await this.fetch(k.toLowerCase());
    if (!items) throw new FeedError('I could not find that subreddit.');
    return { key: k.toLowerCase(), name: `r/${k}`, url: `https://www.reddit.com/r/${k}/`, avatar: null };
  },
  async fetch(k) {
    const res = await get(`https://www.reddit.com/r/${k}/new/.rss?limit=15`);
    if (res?.ok) {
      const xml = await res.text();
      return entries(xml).map(e => ({
        id: tag(e, 'id'), title: tag(e, 'title'), text: null, url: attr(e, 'link', 'href'), thumb: attr(e, 'media:thumbnail', 'url'),
        at: ms(tag(e, 'updated') ?? tag(e, 'published')), author: (tag(e, 'name') || '').replace(/^\/u\//, 'u/') || null,
      })).filter(x => x.id);
    }
    if (res?.status === 404) return null;
    // Reddit often blocks server addresses on its free feed: fall back to SocialCrawl when there is a key
    if (!sc.configured()) throw new FeedError('Reddit blocked the free feed and there is no SocialCrawl key to fall back on.');
    const r = await sc.call('/reddit/subreddit', { subreddit: k, sort: 'new' });
    return sc.posts(r).map(p => ({ id: p.id, title: p.title ?? p.text, text: p.title ? p.text : null, url: p.url, thumb: p.thumb ?? p.media.find(u => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) ?? null, at: p.published?.getTime() ?? null, author: p.author?.username ? `u/${p.author.username}` : null }));
  },
};

/* ── SocialCrawl platforms ─────────────────────────────────────────── */

const paid = (cfg) => ({
  free: false, limit: 5, interval: Math.max(5, Number(process.env.SOCIAL_POLL_MINUTES) || 15) * 60_000, ...cfg,
  async resolve(arg) {
    const h = sc.handle(arg);
    if (!h) throw new FeedError('Give me a username.');
    const a = sc.profile(await sc.call(cfg.profilePath, { handle: h }));
    if (!a) throw new FeedError('I could not find that account.');
    return { key: (a.username ?? h).toLowerCase(), name: a.name ?? a.username ?? h, url: a.url ?? cfg.profileUrl(a.username ?? h), avatar: a.avatar };
  },
  async fetch(key) {
    const r = await sc.call(cfg.postsPath, { handle: key });
    return sc.posts(r).filter(p => !p.pinned || p.published).map(p => ({
      id: p.id, title: null, text: p.text ?? p.title, url: p.url, thumb: p.thumb ?? p.media.find(u => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) ?? null,
      at: p.published?.getTime() ?? null, author: p.author?.name ?? key,
    })).filter(x => x.id).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  },
});

const instagram = paid({ label: 'Instagram', verb: 'posted on Instagram', button: 'Open post', profilePath: '/instagram/profile', postsPath: '/instagram/profile/posts', profileUrl: (u) => `https://www.instagram.com/${u}/` });
const tiktok = paid({ label: 'TikTok', verb: 'posted a new TikTok', button: 'Watch', profilePath: '/tiktok/profile', postsPath: '/tiktok/profile/videos', profileUrl: (u) => `https://www.tiktok.com/@${u}` });
const twitter = paid({ label: 'X', verb: 'posted on X', button: 'Open post', profilePath: '/twitter/profile', postsPath: '/twitter/user/tweets', profileUrl: (u) => `https://x.com/${u}` });

const PLATFORMS = { youtube, reddit, instagram, tiktok, twitter };
const ALIASES = { yt: 'youtube', youtube: 'youtube', rd: 'reddit', reddit: 'reddit', ig: 'instagram', insta: 'instagram', instagram: 'instagram', tt: 'tiktok', tiktok: 'tiktok', x: 'twitter', twt: 'twitter', twitter: 'twitter' };

/** Which posts are new for a row? Oldest first, at most 3. */
function fresh(items, row) {
  const last = row.lastAt === null || row.lastAt === undefined ? null : Number(row.lastAt);
  const out = items.filter(i => i.id !== row.lastId && i.at !== null && last !== null && i.at > last).sort((a, b) => a.at - b.at);
  // a feed without dates: the newest post counts when it is not the one seen last
  if (!out.length && items[0] && items[0].at === null && row.lastId && items[0].id !== row.lastId) out.push(items[0]);
  return out.slice(-3);
}

/** The state to store after reading `items`, so only later posts get announced. */
const baseline = (items) => ({
  lastId: items[0]?.id ?? null,
  lastAt: items.reduce((m, i) => (i.at !== null && i.at > m ? i.at : m), 0) || Date.now(),
});

module.exports = { FeedError, PLATFORMS, ALIASES, fresh, baseline };
