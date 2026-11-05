// grace · Twitch live alerts. Every 2 minutes: ask Twitch which saved streamers are live, post once per stream.

const { PermissionFlagsBits, MessageFlags, Events, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const ui = require('../services/ui');
const { icon, pre } = require('../services/icons');
const tw = require('../services/twitch');
const Notify = require('../database/schemas/TwitchNotify');

const EVERY = 120_000;
let busy = false;

function card(s, row) {
  const c = ui.box('base').setAccentColor(0x9146FF);
  if (row.roleId) c.addTextDisplayComponents(ui.text(`<@&${row.roleId}>`));
  c.addTextDisplayComponents(ui.text(`### ${pre('twitch')}${s.name} is live on Twitch`));
  c.addTextDisplayComponents(ui.text(`**${(s.title || 'Untitled stream').slice(0, 200)}**\nPlaying **${s.game}**  ·  ${s.viewers} watching`));
  if (s.thumb) {
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`${s.thumb}?t=${Math.floor(Date.now() / 60000)}`)));
  }
  c.addActionRowComponents(ui.row(ui.link('Watch now', s.url, icon('twitch') || undefined)));
  return c;
}

async function tick(client) {
  if (busy || !tw.configured()) return;
  busy = true;
  try {
    const rows = await Notify.findAll();
    if (!rows.length) return;
    const ids = [...new Set(rows.map(r => r.twitchId))];
    const live = await tw.liveNow(ids);
    for (const row of rows) {
      const s = live.get(row.twitchId);
      if (!s || s.id === row.lastStreamId) continue;
      await row.update({ lastStreamId: s.id });                      // mark first so a slow send never double-posts
      const channel = await client.channels.fetch(row.channelId).catch(() => null);
      if (!channel?.isTextBased?.()) continue;
      const me = channel.guild?.members?.me;
      const p = me && channel.permissionsFor?.(me);
      if (p && !(p.has(PermissionFlagsBits.SendMessages) && p.has(PermissionFlagsBits.ViewChannel))) continue;
      await channel.send({
        components: [card(s, row)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: row.roleId ? { roles: [row.roleId] } : { parse: [] },
      }).catch((e) => console.error('[twitch] send:', e.message));
    }
  } catch (e) {
    console.error('[twitch] poll:', e.message);
  } finally { busy = false; }
}

module.exports = {
  name: 'twitchEvents',
  init(client) {
    const start = () => { setTimeout(() => tick(client), 15_000); setInterval(() => tick(client), EVERY).unref?.(); };
    if (client.isReady?.()) start(); else client.once(Events.ClientReady, start);
  },
};
