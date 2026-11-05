// grace · new-post alerts for YouTube, Reddit, Instagram, TikTok and X. Checks every minute which platforms are due.

const { PermissionFlagsBits, MessageFlags, Events, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const ui = require('../services/ui');
const { icon, pre } = require('../services/icons');
const feeds = require('../services/socialFeeds');
const SocialFeed = require('../database/schemas/SocialFeed');

const lastRun = {};
const failures = new Map();            // account → consecutive failures, to back off broken ones
let busy = false;
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

function card(platform, row, item) {
  const P = feeds.PLATFORMS[platform];
  const c = ui.box('base');
  if (row.roleId) c.addTextDisplayComponents(ui.text(`<@&${row.roleId}>`));
  c.addTextDisplayComponents(ui.text(`### ${pre(platform)}${clip(item.author || row.name, 60)} ${P.verb}`));
  if (item.title) c.addTextDisplayComponents(ui.text(`**${clip(item.title, 200)}**`));
  if (item.text) c.addTextDisplayComponents(ui.text(clip(item.text, 400)));
  if (item.thumb) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(item.thumb)));
  if (item.url) c.addActionRowComponents(ui.row(ui.link(P.button, item.url, icon(platform) || undefined)));
  return c;
}

async function post(client, row, platform, item) {
  const channel = await client.channels.fetch(row.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return false;
  const me = channel.guild?.members?.me;
  const p = me && channel.permissionsFor?.(me);
  if (p && !(p.has(PermissionFlagsBits.SendMessages) && p.has(PermissionFlagsBits.ViewChannel))) return false;
  await channel.send({
    components: [card(platform, row, item)], flags: MessageFlags.IsComponentsV2,
    allowedMentions: row.roleId ? { roles: [row.roleId] } : { parse: [] },
  }).catch((e) => console.error('[feeds] send:', e.message));
  return true;
}

async function runPlatform(client, platform) {
  const P = feeds.PLATFORMS[platform];
  const rows = await SocialFeed.findAll({ where: { platform } });
  const keys = [...new Set(rows.map(r => r.accountKey))];
  for (const key of keys) {
    const fk = `${platform}:${key}`;
    if ((failures.get(fk) ?? 0) >= 5 && Math.random() > 0.2) continue;            // broken account: try only now and then
    let items;
    try { items = await P.fetch(key); failures.delete(fk); }
    catch (e) { failures.set(fk, (failures.get(fk) ?? 0) + 1); if ((failures.get(fk) % 5) === 1) console.error(`[feeds] ${fk}: ${e.message}`); continue; }
    if (!items?.length) continue;

    for (const row of rows.filter(r => r.accountKey === key)) {
      try {
        if (row.lastAt === null || row.lastAt === undefined) { await row.update(feeds.baseline(items)); continue; }
        const news = feeds.fresh(items, row);
        if (!news.length) continue;
        const newest = Math.max(...news.map(n => n.at ?? 0), Number(row.lastAt));
        await row.update({ lastId: news[news.length - 1].id, lastAt: newest });       // save first: a slow send must never double-post
        for (const item of news) await post(client, row, platform, item);
      } catch (e) { console.error('[feeds] row:', e.message); }
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}

async function tick(client) {
  if (busy) return;
  busy = true;
  try {
    for (const [platform, P] of Object.entries(feeds.PLATFORMS)) {
      if (Date.now() - (lastRun[platform] ?? 0) < P.interval) continue;
      lastRun[platform] = Date.now();
      await runPlatform(client, platform).catch((e) => console.error(`[feeds] ${platform}:`, e.message));
    }
  } finally { busy = false; }
}

module.exports = {
  name: 'socialFeedEvents',
  tick,
  init(client) {
    const start = () => { setTimeout(() => tick(client), 45_000); setInterval(() => tick(client), 60_000).unref?.(); };
    if (client.isReady?.()) start(); else client.once(Events.ClientReady, start);
  },
};
