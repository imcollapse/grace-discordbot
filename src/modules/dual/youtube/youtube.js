// grace · ,youtube  ·  /youtube
//   <query> / search     search videos (free, no credits)
//   channel <@handle>    channel card
//   videos <@handle>     latest uploads        shorts <@handle>   latest shorts
//   video <link>         one video             comments <link>    top comments
//   trending [region]    trending videos
// Everything except search uses SocialCrawl.

const sc = require('../../../services/socialcrawl');
const K = require('../../../services/socialKit');

const P = { color: 0xFF0033, site: 'youtube.com', platform: 'youtube' };

const videoId = (s) => String(s || '').match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/)?.[1] ?? (/^[\w-]{11}$/.test(String(s || '').trim()) ? s.trim() : null);
const videoUrl = (s) => { const id = videoId(s); return id ? `https://www.youtube.com/watch?v=${id}` : null; };
const channelParam = (s) => {
  const t = String(s || '').trim();
  const id = t.match(/youtube\.com\/channel\/(UC[\w-]{20,})/i)?.[1] ?? (/^UC[\w-]{20,}$/.test(t) ? t : null);
  if (id) return { channelId: id };
  const h = t.match(/youtube\.com\/@([\w.-]+)/i)?.[1] ?? t.replace(/^@/, '').split(/[\s/?#]/)[0];
  return h ? { handle: h } : null;
};

const feed = (path, what) => async (ctx, arg) => {
  const ch = channelParam(arg);
  if (!ch) return K.send(ctx, K.note('warning', `Which channel's ${what}?`, 'Use @handle or a channel link'));
  const r = await sc.call(path, ch);
  const next = async (c) => { const n = await sc.call(path, { ...ch, continuationToken: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; };
  return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next, label: ch.handle ? `@${ch.handle}` : 'Channel', ...P });
};

/** Free search through youtube-search-api: no key, no credits. */
async function search(ctx, query) {
  if (!query) return K.send(ctx, K.note('warning', 'What should I search for?', 'youtube <query>'));
  const api = require('youtube-search-api');
  const res = await api.GetListByKeyword(query, false, 25);
  const posts = (res?.items ?? []).filter(x => x.type === 'video').map(v => ({
    id: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, title: v.title ?? null,
    text: [v.length?.simpleText, v.channelTitle].filter(Boolean).join('  ·  ') || null,
    media: [], thumb: v.thumbnail?.thumbnails?.slice(-1)[0]?.url ?? null, duration: null,
    views: null, likes: null, comments: null, shares: null, saves: null, published: null,
    author: v.channelTitle ? { name: v.channelTitle, username: null, verified: false } : null, pinned: false, ext: {},
  }));
  if (!posts.length) return K.send(ctx, K.note('warning', `No videos found for **${K.clip(query, 60)}**.`));
  return K.viewPosts(ctx, { posts, label: `“${K.clip(query, 30)}”`, ...P });
}

module.exports = K.makeCommand({
  name: 'youtube', aliases: ['yt'], help: 'youtube',
  description: 'Search YouTube and look up channels and videos',
  fallback: 'search',
  subs: [
    { name: 'search', aliases: ['find', 's'], desc: 'Search videos', arg: 'query', argDesc: 'What to look for', run: search },
    { name: 'channel', aliases: ['user', 'profile', 'c'], desc: 'Show a channel', arg: 'channel', argDesc: '@handle or channel link',
      run: async (ctx, arg) => {
        const ch = channelParam(arg);
        if (!ch) return K.send(ctx, K.note('warning', 'Which channel?', 'youtube channel @handle'));
        const a = sc.profile(await sc.call('/youtube/channel', ch));
        if (!a) return K.send(ctx, K.note('warning', 'I could not find that channel.'));
        return K.send(ctx, K.profileCard(a, { ...P, url: a.url || (ch.handle ? `https://www.youtube.com/@${ch.handle}` : `https://www.youtube.com/channel/${ch.channelId}`) }));
      } },
    { name: 'videos', aliases: ['uploads'], desc: 'Latest uploads of a channel', arg: 'channel', argDesc: '@handle or channel link', run: feed('/youtube/channel/videos', 'videos') },
    { name: 'shorts', desc: 'Latest shorts of a channel', arg: 'channel', argDesc: '@handle or channel link', run: feed('/youtube/channel/shorts', 'shorts') },
    { name: 'video', aliases: ['watch', 'link'], desc: 'Show one video', arg: 'link', argDesc: 'Video link or id',
      run: async (ctx, arg) => {
        const url = videoUrl(arg);
        if (!url) return K.send(ctx, K.note('warning', arg ? 'That is not a YouTube video link.' : 'Which video?'));
        const p = sc.onePost(await sc.call('/youtube/video', { url }));
        if (!p) return K.send(ctx, K.note('warning', 'I could not read that video.'));
        p.url = p.url || url;
        return K.viewPosts(ctx, { posts: [p], label: 'YouTube', ...P });
      } },
    { name: 'comments', desc: 'Top comments of a video', arg: 'link', argDesc: 'Video link or id',
      run: async (ctx, arg) => {
        const url = videoUrl(arg);
        if (!url) return K.send(ctx, K.note('warning', arg ? 'That is not a YouTube video link.' : 'Which video?'));
        const r = await sc.call('/youtube/video/comments', { url, order: 'top' });
        return K.viewPosts(ctx, { posts: sc.posts(r), label: 'Top comments', ...P });
      } },
    { name: 'trending', aliases: ['trends'], desc: 'Trending videos', arg: 'region', argDesc: 'Country code like US or IN (optional)', required: false,
      run: async (ctx, arg) => {
        const region = (arg || '').trim().slice(0, 2).toUpperCase() || undefined;
        const r = await sc.call('/youtube/videos/trending', { region, max_results: 25 });
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), label: `Trending${region ? ` ${region}` : ''}`, ...P });
      } },
  ],
});
