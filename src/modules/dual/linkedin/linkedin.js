// grace · ,linkedin  ·  /linkedin   (data from SocialCrawl)
// LinkedIn lookups cost 5 credits each, so they are kept to the useful few.

const sc = require('../../../services/socialcrawl');
const K = require('../../../services/socialKit');

const P = { color: 0x0A66C2, site: 'linkedin.com', platform: 'linkedin' };
const link = (s, kind) => {
  const t = String(s || '').trim().split(/\s/)[0];
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  const slug = t.replace(/^@/, '').replace(/^\/?(?:in|company)\//i, '').replace(/\/$/, '');
  return `https://www.linkedin.com/${kind === 'company' ? 'company' : 'in'}/${slug}/`;
};

module.exports = K.makeCommand({
  name: 'linkedin', aliases: ['li'], help: 'linkedin',
  description: 'Look up public LinkedIn profiles and companies',
  fallback: 'profile',
  subs: [
    { name: 'profile', aliases: ['user', 'u', 'p'], desc: 'Show a public profile', arg: 'profile', argDesc: 'Profile link or name after /in/',
      run: async (ctx, arg) => {
        const url = link(arg, 'in');
        if (!url) return K.send(ctx, K.note('warning', 'Whose profile?', 'linkedin profile <link or name after /in/>'));
        const a = sc.profile(await sc.call('/linkedin/profile', { url }));
        if (!a) return K.send(ctx, K.note('warning', 'I could not find that profile.'));
        return K.send(ctx, K.profileCard(a, { ...P, url: a.url || url }));
      } },
    { name: 'posts', aliases: ['feed'], desc: 'Latest posts of a profile', arg: 'profile', argDesc: 'Profile link or name after /in/',
      run: async (ctx, arg) => {
        const url = link(arg, 'in');
        if (!url) return K.send(ctx, K.note('warning', 'Whose posts?'));
        const r = await sc.call('/linkedin/profile/posts', { url, limit: 20 });
        return K.viewPosts(ctx, { posts: sc.posts(r), label: 'LinkedIn', ...P });
      } },
    { name: 'company', aliases: ['c', 'org'], desc: 'Show a company page', arg: 'company', argDesc: 'Company link or name after /company/',
      run: async (ctx, arg) => {
        const url = link(arg, 'company');
        if (!url) return K.send(ctx, K.note('warning', 'Which company?', 'linkedin company <link or name>'));
        const a = sc.profile(await sc.call('/linkedin/company', { url }));
        if (!a) return K.send(ctx, K.note('warning', 'I could not find that company.'));
        return K.send(ctx, K.profileCard(a, { ...P, url: a.url || url }));
      } },
    { name: 'companyposts', aliases: ['cposts'], desc: 'Latest posts of a company (10 lookups)', arg: 'company', argDesc: 'Company link or name after /company/',
      run: async (ctx, arg) => {
        const url = link(arg, 'company');
        if (!url) return K.send(ctx, K.note('warning', 'Which company?'));
        const d = (await sc.call('/linkedin/company', { url }))?.data ?? {};
        const id = d.company_id ?? d.id ?? d.author?.id ?? d.author?.ext?.company_id;
        if (!id) return K.send(ctx, K.note('warning', 'I could not find that company\'s id.'));
        const r = await sc.call('/linkedin/company/posts', { company_id: id });
        return K.viewPosts(ctx, { posts: sc.posts(r), label: 'Company posts', ...P });
      } },
  ],
});
