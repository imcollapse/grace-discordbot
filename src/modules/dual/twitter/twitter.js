// grace · ,twitter  ·  /twitter   (data from SocialCrawl; X)

const sc = require('../../../services/socialcrawl');
const K = require('../../../services/socialKit');

const P = { color: 0x1D9BF0, site: 'x.com', platform: 'twitter' };
const isLink = (s) => /(?:twitter|x)\.com\/.+\/status\//i.test(s || '');
const getPost = async (arg) => (isLink(arg) ? sc.onePost(await sc.call('/twitter/tweet', { url: arg.split(/\s/)[0] })) : null);

const feed = (path, what) => async (ctx, arg) => {
  if (!arg) return K.send(ctx, K.note('warning', `Whose ${what}?`));
  const h = sc.handle(arg);
  const r = await sc.call(path, { handle: h });
  const next = async (c) => { const n = await sc.call(path, { handle: h, cursor: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; };
  return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next, label: `@${h}`, ...P });
};

module.exports = K.makeCommand({
  name: 'twitter', aliases: ['x', 'twt'], help: 'twitter',
  description: 'Look up X (Twitter) profiles and posts',
  fallback: 'profile',
  subs: [
    { name: 'profile', aliases: ['user', 'u', 'p'], desc: 'Show a profile', arg: 'username', argDesc: 'X username',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Whose profile?', 'twitter profile <username>'));
        const a = sc.profile(await sc.call('/twitter/profile', { handle: sc.handle(arg) }));
        if (!a) return K.send(ctx, K.note('warning', 'I could not find that account.'));
        return K.send(ctx, K.profileCard(a, { ...P, url: `https://x.com/${a.username}` }));
      } },
    { name: 'tweets', aliases: ['posts', 'feed'], desc: 'Latest posts of an account', arg: 'username', argDesc: 'X username', run: feed('/twitter/user/tweets', 'posts') },
    { name: 'media', desc: 'Posts with pictures or video', arg: 'username', argDesc: 'X username', run: feed('/twitter/user/media', 'media') },
    { name: 'tweet', aliases: ['post', 'link', 'status'], desc: 'Show one post', arg: 'link', argDesc: 'Post link',
      run: async (ctx, arg) => {
        const p = await getPost(arg || '');
        if (!p) return K.send(ctx, K.note('warning', arg ? 'That is not an X post link.' : 'Which post?', 'Send the full link, like https://x.com/user/status/…'));
        return K.viewPosts(ctx, { posts: [p], label: 'X', ...P });
      } },
    { name: 'download', aliases: ['dl', 'save'], desc: 'Get a post\'s pictures or video as files', arg: 'link', argDesc: 'Post link',
      run: async (ctx, arg) => {
        const p = await getPost(arg || '');
        if (!p) return K.send(ctx, K.note('warning', arg ? 'That is not an X post link.' : 'Which post?'));
        return K.sendMedia(ctx, p, ctx.guild?.maximumUploadLimit ?? 10 * 1024 * 1024);
      } },
    { name: 'search', aliases: ['find'], desc: 'Search posts', arg: 'query', argDesc: 'Words, or operators like from:name',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What should I look for?', 'Operators work: from:name, min_faves:100'));
        const r = await sc.call('/twitter/search/tweets', { query: arg, sort: 'top' });
        const next = async (c) => { const n = await sc.call('/twitter/search/tweets', { query: arg, sort: 'top', cursor: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; };
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next, label: `“${K.clip(arg, 30)}”`, ...P });
      } },
    { name: 'users', aliases: ['accounts'], desc: 'Find accounts', arg: 'query', argDesc: 'Name or keyword',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What should I look for?'));
        const list = sc.authors(await sc.call('/twitter/search/users', { query: arg }));
        if (!list.length) return K.send(ctx, K.note('warning', 'No accounts found.'));
        return K.send(ctx, K.listProfiles(list, { title: `Accounts for “${K.clip(arg, 40)}”`, url: (u) => `https://x.com/${u}`, ...P }));
      } },
  ],
});
