// grace · ,facebook  ·  /facebook   (data from SocialCrawl)

const sc = require('../../../services/socialcrawl');
const K = require('../../../services/socialKit');

const P = { color: 0x1877F2, site: 'facebook.com', platform: 'facebook' };
const pageUrl = (s) => { const t = String(s || '').trim().split(/\s/)[0]; return !t ? null : /^https?:\/\//i.test(t) ? t : `https://www.facebook.com/${t.replace(/^@/, '').replace(/^\//, '')}`; };
const isFb = (s) => /(?:facebook|fb)\.(?:com|watch)\//i.test(s || '') || /^fb\.watch\//i.test(s || '');

const pageFeed = (path, label) => async (ctx, arg) => {
  const url = pageUrl(arg);
  if (!url) return K.send(ctx, K.note('warning', 'Which page?', 'Use the page name or link'));
  const r = await sc.call(path, { url });
  return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next: async (c) => { const n = await sc.call(path, { url, cursor: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; }, label, ...P });
};

module.exports = K.makeCommand({
  name: 'facebook', aliases: ['fb'], help: 'facebook',
  description: 'Look up Facebook pages, posts and groups',
  fallback: 'page',
  subs: [
    { name: 'page', aliases: ['profile', 'user', 'p'], desc: 'Show a page', arg: 'page', argDesc: 'Page name or link',
      run: async (ctx, arg) => {
        const url = pageUrl(arg);
        if (!url) return K.send(ctx, K.note('warning', 'Which page?', 'facebook page <name or link>'));
        const a = sc.profile(await sc.call('/facebook/profile', { url }));
        if (!a) return K.send(ctx, K.note('warning', 'I could not find that page.'));
        return K.send(ctx, K.profileCard(a, { ...P, url: a.url || url }));
      } },
    { name: 'posts', aliases: ['feed'], desc: 'Latest posts of a page', arg: 'page', argDesc: 'Page name or link', run: pageFeed('/facebook/profile/posts', 'Posts') },
    { name: 'reels', aliases: ['reel'], desc: 'Latest reels of a page', arg: 'page', argDesc: 'Page name or link', run: pageFeed('/facebook/profile/reels', 'Reels') },
    { name: 'post', aliases: ['link'], desc: 'Show one post or video', arg: 'link', argDesc: 'Post link',
      run: async (ctx, arg) => {
        if (!isFb(arg)) return K.send(ctx, K.note('warning', arg ? 'That is not a Facebook link.' : 'Which post?'));
        const p = sc.onePost(await sc.call('/facebook/post', { url: arg.split(/\s/)[0] }));
        if (!p) return K.send(ctx, K.note('warning', 'I could not read that post.'));
        return K.viewPosts(ctx, { posts: [p], label: 'Facebook', ...P });
      } },
    { name: 'group', aliases: ['g'], desc: 'Show a public group', arg: 'group', argDesc: 'Group link or id',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Which group?'));
        const t = arg.trim().split(/\s/)[0];
        const r = await sc.call('/facebook/group', /^\d+$/.test(t) ? { group_id: t } : { url: pageUrl(t) });
        const d = r?.data?.group ?? r?.data ?? {};
        const a = sc.author(d.author) ?? sc.author({ display_name: d.name ?? d.title, bio: d.description, followers: d.member_count ?? d.members ?? null, url: d.url, avatar_url: d.image ?? d.avatar_url });
        if (!a?.name) return K.send(ctx, K.note('warning', 'I could not read that group.'));
        return K.send(ctx, K.profileCard(a, { ...P, url: a.url || pageUrl(t), extra: d.privacy ? [`Privacy: ${d.privacy}`] : [] }));
      } },
    { name: 'search', aliases: ['find'], desc: 'Search public posts', arg: 'query', argDesc: 'What to look for',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What should I look for?'));
        const r = await sc.call('/facebook/search/posts', { query: arg });
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next: async (c) => { const n = await sc.call('/facebook/search/posts', { query: arg, cursor: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; }, label: `“${K.clip(arg, 30)}”`, ...P });
      } },
    { name: 'pages', desc: 'Find pages', arg: 'query', argDesc: 'Name or keyword',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What should I look for?'));
        const list = sc.authors(await sc.call('/facebook/search/pages', { query: arg }));
        if (!list.length) return K.send(ctx, K.note('warning', 'No pages found.'));
        return K.send(ctx, K.listProfiles(list, { title: `Pages for “${K.clip(arg, 40)}”`, ...P }));
      } },
  ],
});
