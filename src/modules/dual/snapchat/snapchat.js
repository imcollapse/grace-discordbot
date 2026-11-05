// grace · ,snapchat  ·  /snapchat   (data from SocialCrawl)

const sc = require('../../../services/socialcrawl');
const K = require('../../../services/socialKit');

const P = { color: 0xFFFC00, site: 'snapchat.com', platform: 'snapchat' };

module.exports = K.makeCommand({
  name: 'snapchat', aliases: ['snap', 'sc'], help: 'snapchat',
  description: 'Look up Snapchat profiles and Spotlight comments',
  fallback: 'profile',
  subs: [
    { name: 'profile', aliases: ['user', 'u', 'p'], desc: 'Show a public profile', arg: 'username', argDesc: 'Snapchat username',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Whose profile?', 'snapchat profile <username>'));
        const h = sc.handle(arg).replace(/^.*snapchat\.com\/add\//i, '');
        const a = sc.profile(await sc.call('/snapchat/profile', { handle: h }));
        if (!a) return K.send(ctx, K.note('warning', 'I could not find that account.'));
        return K.send(ctx, K.profileCard(a, { ...P, url: a.url || `https://www.snapchat.com/add/${h}` }));
      } },
    { name: 'comments', aliases: ['spotlight'], desc: 'Comments on a Spotlight snap', arg: 'link', argDesc: 'Spotlight link',
      run: async (ctx, arg) => {
        if (!/snapchat\.com\//i.test(arg || '')) return K.send(ctx, K.note('warning', arg ? 'That is not a Snapchat link.' : 'Which Spotlight?'));
        const url = arg.split(/\s/)[0];
        const r = await sc.call('/snapchat/spotlight/comments', { url });
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next: async (c) => { const n = await sc.call('/snapchat/spotlight/comments', { url, cursor: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; }, label: 'Spotlight', ...P });
      } },
  ],
});
