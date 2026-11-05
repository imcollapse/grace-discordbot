// grace · ,instagram  ·  /instagram   (data from SocialCrawl)

const sc = require('../../../services/socialcrawl');
const K = require('../../../services/socialKit');

const COLOR = 0xE1306C, SITE = 'instagram.com';
const P = { color: COLOR, site: SITE, platform: 'instagram' };
const URL_HINT = 'Send the full post link, like https://www.instagram.com/p/…';

const postsOf = (path, nextKey) => async (ctx, arg) => {
  if (!arg) return K.send(ctx, K.note('warning', 'Whose account?'));
  const h = sc.handle(arg);
  const r = await sc.call(path, { handle: h });
  const next = async (cursor) => { const n = await sc.call(path, { handle: h, [nextKey]: cursor }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; };
  return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next, label: `@${h}`, ...P });
};

const getPost = async (arg) => {
  if (!/instagram\.com\//i.test(arg)) return null;
  return sc.onePost(await sc.call('/instagram/post', { url: arg.split(/\s/)[0] }));
};

module.exports = K.makeCommand({
  name: 'instagram', aliases: ['ig', 'insta'], help: 'instagram',
  description: 'Look up Instagram profiles, posts and reels',
  fallback: 'profile',
  subs: [
    { name: 'profile', aliases: ['user', 'u', 'p'], desc: 'Show a profile', arg: 'username', argDesc: 'Instagram username',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Whose profile?', 'instagram profile <username>'));
        const a = sc.profile(await sc.call('/instagram/profile', { handle: sc.handle(arg) }));
        if (!a) return K.send(ctx, K.note('warning', 'I could not find that account.'));
        return K.send(ctx, K.profileCard(a, { ...P, url: `https://www.instagram.com/${a.username}/` }));
      } },
    { name: 'posts', aliases: ['feed'], desc: 'Latest posts of an account', arg: 'username', argDesc: 'Instagram username', run: postsOf('/instagram/profile/posts', 'next_max_id') },
    { name: 'reels', aliases: ['reel'], desc: 'Latest reels of an account', arg: 'username', argDesc: 'Instagram username', run: postsOf('/instagram/profile/reels', 'max_id') },
    { name: 'post', aliases: ['link'], desc: 'Show one post or reel', arg: 'link', argDesc: 'Post or reel link',
      run: async (ctx, arg) => {
        const p = await getPost(arg || '');
        if (!p) return K.send(ctx, K.note('warning', arg ? 'That is not an Instagram post link.' : 'Which post?', URL_HINT));
        return K.viewPosts(ctx, { posts: [p], label: 'Instagram', ...P });
      } },
    { name: 'download', aliases: ['dl', 'save'], desc: 'Get a post or reel as a file', arg: 'link', argDesc: 'Post or reel link',
      run: async (ctx, arg) => {
        const p = await getPost(arg || '');
        if (!p) return K.send(ctx, K.note('warning', arg ? 'That is not an Instagram post link.' : 'Which post?', URL_HINT));
        return K.sendMedia(ctx, p, ctx.guild?.maximumUploadLimit ?? 10 * 1024 * 1024);
      } },
    { name: 'search', aliases: ['find'], desc: 'Find accounts', arg: 'query', argDesc: 'Name or keyword',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What should I look for?'));
        const list = sc.authors(await sc.call('/instagram/search/profiles', { query: arg }));
        if (!list.length) return K.send(ctx, K.note('warning', 'No accounts found.'));
        return K.send(ctx, K.listProfiles(list, { title: `Accounts for “${K.clip(arg, 40)}”`, url: (u) => `https://www.instagram.com/${u}/`, ...P }));
      } },
    { name: 'hashtag', aliases: ['tag'], desc: 'Top posts of a hashtag', arg: 'hashtag', argDesc: 'Hashtag, with or without #',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Which hashtag?'));
        const tag = arg.replace(/^#/, '').split(/\s/)[0];
        const r = await sc.call('/instagram/search/hashtag', { hashtag: tag, type: 'top' });
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), label: `#${tag}`, ...P });
      } },
  ],
});
