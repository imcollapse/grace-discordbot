// grace · ,threads  ·  /threads   (data from SocialCrawl)

const sc = require('../../../services/socialcrawl');
const K = require('../../../services/socialKit');

const P = { color: 0x9B9B9B, site: 'threads.com', platform: 'threads' };
const isLink = (s) => /threads\.(?:net|com)\/.+\/post\//i.test(s || '');

module.exports = K.makeCommand({
  name: 'threads', aliases: ['thread', 'th'], help: 'threads',
  description: 'Look up Threads profiles and posts',
  fallback: 'profile',
  subs: [
    { name: 'profile', aliases: ['user', 'u', 'p'], desc: 'Show a profile', arg: 'username', argDesc: 'Threads username',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Whose profile?', 'threads profile <username>'));
        const h = sc.handle(arg).replace(/^.*threads\.(?:net|com)\/@?/i, '');
        const a = sc.profile(await sc.call('/threads/profile', { handle: h }));
        if (!a) return K.send(ctx, K.note('warning', 'I could not find that account.'));
        return K.send(ctx, K.profileCard(a, { ...P, url: a.url || `https://www.threads.com/@${h}` }));
      } },
    { name: 'posts', aliases: ['feed'], desc: 'Latest posts of an account', arg: 'username', argDesc: 'Threads username',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Whose posts?'));
        const h = sc.handle(arg).replace(/^.*threads\.(?:net|com)\/@?/i, '');
        const r = await sc.call('/threads/user/posts', { handle: h, limit: 15 });
        return K.viewPosts(ctx, { posts: sc.posts(r), label: `@${h}`, ...P });
      } },
    { name: 'post', aliases: ['link'], desc: 'Show one post', arg: 'link', argDesc: 'Post link',
      run: async (ctx, arg) => {
        if (!isLink(arg)) return K.send(ctx, K.note('warning', arg ? 'That is not a Threads post link.' : 'Which post?'));
        const p = sc.onePost(await sc.call('/threads/post', { url: arg.split(/\s/)[0] }));
        if (!p) return K.send(ctx, K.note('warning', 'I could not read that post.'));
        return K.viewPosts(ctx, { posts: [p], label: 'Threads', ...P });
      } },
    { name: 'replies', aliases: ['comments'], desc: 'Replies to a post', arg: 'link', argDesc: 'Post link',
      run: async (ctx, arg) => {
        if (!isLink(arg)) return K.send(ctx, K.note('warning', arg ? 'That is not a Threads post link.' : 'Which post?'));
        const r = await sc.call('/threads/post/comments', { url: arg.split(/\s/)[0], limit: 20 });
        return K.viewPosts(ctx, { posts: sc.posts(r), label: 'Replies', ...P });
      } },
    { name: 'search', aliases: ['find'], desc: 'Search posts', arg: 'query', argDesc: 'What to look for',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What should I look for?'));
        const r = await sc.call('/threads/search', { query: arg, limit: 20 });
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next: async (c) => { const n = await sc.call('/threads/search', { query: arg, limit: 20, cursor: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; }, label: `“${K.clip(arg, 30)}”`, ...P });
      } },
    { name: 'users', aliases: ['accounts'], desc: 'Find accounts', arg: 'query', argDesc: 'Name or keyword',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What should I look for?'));
        const list = sc.authors(await sc.call('/threads/search/users', { query: arg, limit: 10 }));
        if (!list.length) return K.send(ctx, K.note('warning', 'No accounts found.'));
        return K.send(ctx, K.listProfiles(list, { title: `Accounts for “${K.clip(arg, 40)}”`, url: (u) => `https://www.threads.com/@${u}`, ...P }));
      } },
  ],
});
