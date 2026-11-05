// grace · ,reddit  ·  /reddit   (data from SocialCrawl)

const sc = require('../../../services/socialcrawl');
const K = require('../../../services/socialKit');

const P = { color: 0xFF4500, site: 'reddit.com', platform: 'reddit' };
const SORTS = ['hot', 'new', 'top', 'rising', 'best'];
const sub = (s) => String(s || '').trim().replace(/^https?:\/\/(?:www\.|old\.)?reddit\.com\//i, '').replace(/^\/?r\//i, '').split(/[/?#\s]/)[0];

module.exports = K.makeCommand({
  name: 'reddit', aliases: ['rd'], help: 'reddit',
  description: 'Browse Reddit communities and posts',
  fallback: 'subreddit',
  subs: [
    { name: 'subreddit', aliases: ['sub', 'r'], desc: 'Browse a subreddit', arg: 'subreddit', argDesc: 'Name, optionally followed by hot, new or top',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Which subreddit?', 'reddit subreddit <name> [hot|new|top]'));
        const words = arg.trim().split(/\s+/);
        const name = sub(words[0]);
        const sort = SORTS.includes((words[1] || '').toLowerCase()) ? words[1].toLowerCase() : 'hot';
        const r = await sc.call('/reddit/subreddit', { subreddit: name, sort });
        const next = async (c) => { const n = await sc.call('/reddit/subreddit', { subreddit: name, sort, after: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; };
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next, label: `r/${name} · ${sort}`, ...P });
      } },
    { name: 'info', aliases: ['about'], desc: 'About a subreddit', arg: 'subreddit', argDesc: 'Subreddit name',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'Which subreddit?'));
        const name = sub(arg);
        const d = (await sc.call('/reddit/subreddit/details', { subreddit: name }))?.data ?? {};
        const dd = d.subreddit ?? d.community ?? d;
        const members = dd.subscribers ?? dd.subscriber_count ?? dd.members ?? dd.followers ?? null;
        const title = dd.title ?? dd.display_name ?? `r/${name}`;
        const desc = dd.description ?? dd.public_description ?? dd.about ?? '';
        const c = require('../../../services/ui').box('base').setAccentColor(P.color);
        c.addSectionComponents(require('../../../services/ui').section([`## ${K.clip(title, 80)}`, `r/${name}`, members !== null ? `**${K.num(members)}** members` : '', desc ? K.clip(String(desc), 500) : ''].filter(Boolean).join('\n'), dd.icon ?? dd.icon_url ?? dd.avatar_url ?? null));
        c.addActionRowComponents(require('../../../services/ui').row(require('../../../services/ui').link('Open', `https://www.reddit.com/r/${name}/`)));
        return K.send(ctx, c);
      } },
    { name: 'post', aliases: ['link', 'thread'], desc: 'Show one post', arg: 'link', argDesc: 'Reddit post link',
      run: async (ctx, arg) => {
        if (!/reddit\.com\//i.test(arg || '')) return K.send(ctx, K.note('warning', arg ? 'That is not a Reddit post link.' : 'Which post?'));
        const p = sc.onePost(await sc.call('/reddit/post', { url: arg.split(/\s/)[0] }));
        if (!p) return K.send(ctx, K.note('warning', 'I could not read that post.'));
        return K.viewPosts(ctx, { posts: [p], label: 'Reddit', ...P });
      } },
    { name: 'search', aliases: ['find'], desc: 'Search posts', arg: 'query', argDesc: 'What to look for',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What should I look for?'));
        const r = await sc.call('/reddit/search', { query: arg, sort: 'relevance' });
        const next = async (c) => { const n = await sc.call('/reddit/search', { query: arg, sort: 'relevance', after: c }); return { posts: sc.posts(n), cursor: sc.cursor(n) }; };
        return K.viewPosts(ctx, { posts: sc.posts(r), cursor: sc.cursor(r), next, label: `“${K.clip(arg, 30)}”`, ...P });
      } },
    { name: 'communities', aliases: ['subs', 'subreddits'], desc: 'Find subreddits', arg: 'query', argDesc: 'Topic',
      run: async (ctx, arg) => {
        if (!arg) return K.send(ctx, K.note('warning', 'What topic?'));
        const rows = sc.rows(await sc.call('/reddit/subreddits/search', { query: arg, limit: 10 }));
        if (!rows.length) return K.send(ctx, K.note('warning', 'No communities found.'));
        const ui = require('../../../services/ui');
        const c = ui.box('base').setAccentColor(P.color).addTextDisplayComponents(ui.text(`### Communities for “${K.clip(arg, 40)}”`));
        c.addTextDisplayComponents(ui.text(rows.slice(0, 10).map((x, i) => {
          const n = x.name ?? x.display_name ?? x.subreddit ?? x.author?.username ?? x.username;
          const m = x.subscribers ?? x.subscriber_count ?? x.followers ?? x.author?.followers ?? null;
          const d = x.description ?? x.public_description ?? x.author?.bio ?? '';
          return `**${i + 1}.** [r/${n}](https://www.reddit.com/r/${n}/)${m !== null ? `  ·  ${K.num(m)}` : ''}${d ? `\n${ui.sub(K.clip(String(d).replace(/\s+/g, ' '), 90))}` : ''}`;
        }).join('\n')));
        return K.send(ctx, c);
      } },
  ],
});
