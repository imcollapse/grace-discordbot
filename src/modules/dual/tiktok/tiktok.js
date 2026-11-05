// grace · ,tiktok  ·  /tiktok   (data from SocialCrawl)

const sc = require('../../../services/socialcrawl');
const K = require('../../../services/socialKit');

const P = { color: 0x25F4EE, site: 'tiktok.com', platform: 'tiktok' };
const isLink = (s) => /tiktok\.com\//i.test(s || '');
const getPost = async (arg) => (isLink(arg) ? sc.onePost(await sc.call('/tiktok/post', { url: arg.split(/\s/)[0] })) : null);

module.exports = K.makeCommand({
  name: 'tiktok', aliases: ['tt'], help: 'tiktok',
  description: 'Look up TikTok profiles, videos and trends',
  fallback: 'profile',
  subs: [
    { name: 'profile', aliases: ['user', 'u', 'p'], desc: 'Show a profile', arg: 'username', argDesc: 'TikTok username',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Whose profile?', 'tiktok profile <username>'));
        const a = sc.profile(await sc.call('/tiktok/profile', { handle: sc.handle(arg) }));
        if (!a) return K.send(ctx, K.note('warning', 'I could not find that account.'));
        return K.send(ctx, K.profileCard(a, { ...P, url: `https://www.tiktok.com/@${a.username}` }));
      } },
    { name: 'videos', aliases: ['feed', 'posts'], desc: 'Latest videos of an account', arg: 'username', argDesc: 'TikTok username',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Whose videos?'));
        const h = sc.handle(arg);
        const r = await sc.call('/tiktok/profile/videos', { handle: h });
        const next = async (c) => { const n = await sc.call('/tiktok/profile/videos', { handle: h, max_cursor: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; };
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next, label: `@${h}`, ...P });
      } },
    { name: 'video', aliases: ['post', 'link'], desc: 'Show one video', arg: 'link', argDesc: 'TikTok video link',
      run: async (ctx, arg) => {
        const p = await getPost(arg || '');
        if (!p) return K.send(ctx, K.note('warning', arg ? 'That is not a TikTok link.' : 'Which video?', 'Send the full link, like https://www.tiktok.com/@user/video/…'));
        return K.viewPosts(ctx, { posts: [p], label: 'TikTok', ...P });
      } },
    { name: 'download', aliases: ['dl', 'save'], desc: 'Get a video as a file', arg: 'link', argDesc: 'TikTok video link',
      run: async (ctx, arg) => {
        const p = await getPost(arg || '');
        if (!p) return K.send(ctx, K.note('warning', arg ? 'That is not a TikTok link.' : 'Which video?'));
        return K.sendMedia(ctx, p, ctx.guild?.maximumUploadLimit ?? 10 * 1024 * 1024);
      } },
    { name: 'search', aliases: ['find'], desc: 'Search videos', arg: 'query', argDesc: 'What to look for',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What should I look for?'));
        const r = await sc.call('/tiktok/search/top', { query: arg });
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), label: `“${K.clip(arg, 30)}”`, ...P });
      } },
    { name: 'users', aliases: ['accounts'], desc: 'Find accounts', arg: 'query', argDesc: 'Name or keyword',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What should I look for?'));
        const list = sc.authors(await sc.call('/tiktok/search/users', { query: arg, limit: 10 }));
        if (!list.length) return K.send(ctx, K.note('warning', 'No accounts found.'));
        return K.send(ctx, K.listProfiles(list, { title: `Accounts for “${K.clip(arg, 40)}”`, url: (u) => `https://www.tiktok.com/@${u}`, ...P }));
      } },
    { name: 'hashtag', aliases: ['tag'], desc: 'Videos of a hashtag', arg: 'hashtag', argDesc: 'Hashtag, with or without #',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Which hashtag?'));
        const tag = arg.replace(/^#/, '').split(/\s/)[0];
        const r = await sc.call('/tiktok/search/hashtag', { hashtag: tag });
        const next = async (c) => { const n = await sc.call('/tiktok/search/hashtag', { hashtag: tag, cursor: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; };
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next, label: `#${tag}`, ...P });
      } },
    { name: 'trending', aliases: ['trends', 'fyp'], desc: 'Trending videos right now', arg: 'region', argDesc: 'Country code like US or IN (optional)', required: false,
      run: async (ctx, arg) => {
        const region = (arg || '').trim().slice(0, 2).toUpperCase() || undefined;
        const r = await sc.call('/tiktok/trending', { region, feed: region ? 'local' : 'global' });
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), label: `Trending${region ? ` ${region}` : ''}`, ...P });
      } },
    { name: 'live', desc: 'Is an account live?', arg: 'username', argDesc: 'TikTok username',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Whose live?'));
        const h = sc.handle(arg);
        const d = (await sc.call('/tiktok/user/live', { handle: h }))?.data ?? {};
        const live = d.is_live ?? d.live ?? false;
        return K.send(ctx, K.note(live ? 'success' : 'info', live ? `**@${h}** is live right now.` : `**@${h}** is not live.`, live ? `https://www.tiktok.com/@${h}/live` : null));
      } },
  ],
});
