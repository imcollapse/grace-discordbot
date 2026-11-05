// grace · lockdown. Stops @everyone from talking in every channel (or lets them back in).
// Each channel remembers the @everyone overwrite it had, so unlocking puts everything back exactly.
//
//   start / end         the actions (also used by antiraid)
//   status              what the panel shows
//   setIgnored          channels that stay open (rules, announcements, a "help" channel)
//   protectNew          channels created during a lockdown are locked too
//   expire              ends lockdowns whose time is up (called by a timer)

const { ChannelType: T, PermissionFlagsBits: P } = require('discord.js');
const S = require('./securityKit');
const { GuardSettings } = require('../database/schemas');

const TEXTLIKE = new Set([T.GuildText, T.GuildAnnouncement, T.GuildForum, T.GuildMedia]);
const VOICELIKE = new Set([T.GuildVoice, T.GuildStageVoice]);
const TEXT_PERMS = { SendMessages: P.SendMessages, AddReactions: P.AddReactions, SendMessagesInThreads: P.SendMessagesInThreads, CreatePublicThreads: P.CreatePublicThreads, CreatePrivateThreads: P.CreatePrivateThreads };
const VOICE_PERMS = { Connect: P.Connect, Speak: P.Speak };

const permsFor = (ch) => (TEXTLIKE.has(ch.type) ? TEXT_PERMS : VOICELIKE.has(ch.type) ? VOICE_PERMS : null);

const state = (guildId) => S.read(guildId, 'lockdown');

/** What @everyone's overwrite said about each permission before: true / false / null (neutral). */
function snapshot(channel, everyoneId, perms) {
  const ow = channel.permissionOverwrites.cache.get(everyoneId);
  const out = {};
  for (const [name, bit] of Object.entries(perms)) out[name] = ow?.allow.has(bit) ? true : ow?.deny.has(bit) ? false : null;
  return out;
}

/** Can @everyone see it at all? Private channels don't need locking. */
const visible = (channel, everyone) => channel.permissionsFor(everyone)?.has(P.ViewChannel);

async function lockOne(guild, channel, st, reason) {
  const perms = permsFor(channel);
  if (!perms || st.ignored.includes(channel.id) || st.channels[channel.id]) return 'skip';
  if (!visible(channel, guild.roles.everyone)) return 'skip';
  const prev = snapshot(channel, guild.roles.everyone.id, perms);
  const deny = Object.fromEntries(Object.keys(perms).map(k => [k, false]));
  try {
    await channel.permissionOverwrites.edit(guild.roles.everyone, deny, { reason });
    st.channels[channel.id] = prev;
    return 'ok';
  } catch { return 'fail'; }
}

async function unlockOne(guild, channel, prev, reason) {
  try {
    await channel.permissionOverwrites.edit(guild.roles.everyone, prev, { reason });
    return true;
  } catch { return false; }
}

/** Lock the server. @returns { locked, failed, already } */
async function start(guild, { by = null, reason = null, minutes = 0, source = 'manual' } = {}) {
  const st = await state(guild.id);
  const already = st.active;
  const why = `Lockdown${reason ? `: ${reason}` : ''}`;
  const channels = { ...st.channels };
  const work = { ...st, channels };
  let locked = 0, failed = 0;
  for (const ch of guild.channels.cache.values()) {
    if (ch.isThread?.()) continue;
    const r = await lockOne(guild, ch, work, why);
    if (r === 'ok') locked++; else if (r === 'fail') failed++;
  }
  await S.write(guild.id, 'lockdown', {
    active: true,
    since: already ? st.since : Date.now(),
    until: minutes > 0 ? Date.now() + minutes * 60_000 : (already ? st.until : 0),
    reason: reason ?? (already ? st.reason : null),
    by: by ?? (already ? st.by : null),
    source: already ? st.source : source,
    channels,
  });
  return { locked, failed, already };
}

/** Unlock everything that was locked. @returns { restored, failed } */
async function end(guild) {
  const st = await state(guild.id);
  let restored = 0, failed = 0;
  for (const [id, prev] of Object.entries(st.channels)) {
    const ch = guild.channels.cache.get(id);
    if (!ch) continue;                       // deleted meanwhile
    (await unlockOne(guild, ch, prev, 'Lockdown ended')) ? restored++ : failed++;
  }
  await S.write(guild.id, 'lockdown', { active: false, since: 0, until: 0, reason: null, by: null, source: null, channels: {} });
  return { restored, failed };
}

/** Open or close individual channels while a lockdown runs. */
async function setIgnored(guild, ids) {
  const st = await state(guild.id);
  const next = [...new Set(ids)];
  const channels = { ...st.channels };
  if (st.active) {
    for (const id of next) {                 // newly ignored → open again
      if (channels[id]) {
        const ch = guild.channels.cache.get(id);
        if (ch) await unlockOne(guild, ch, channels[id], 'Lockdown: channel kept open');
        delete channels[id];
      }
    }
  }
  await S.write(guild.id, 'lockdown', { ignored: next, channels });
  if (st.active) {                           // no longer ignored → lock now
    const fresh = await state(guild.id);
    const work = { ...fresh, channels: { ...fresh.channels } };
    for (const id of st.ignored.filter(x => !next.includes(x))) {
      const ch = guild.channels.cache.get(id);
      if (ch) await lockOne(guild, ch, work, 'Lockdown');
    }
    await S.write(guild.id, 'lockdown', { channels: work.channels });
  }
}

async function protectNew(channel) {
  const guild = channel.guild;
  if (!guild || channel.isThread?.()) return;
  const st = await state(guild.id);
  if (!st.active) return;
  const work = { ...st, channels: { ...st.channels } };
  if ((await lockOne(guild, channel, work, 'Lockdown: new channel')) === 'ok') await S.write(guild.id, 'lockdown', { channels: work.channels });
}

async function expire(client) {
  const rows = await GuardSettings.findAll({ where: { scope: 'lockdown' } }).catch(() => []);
  for (const r of rows) {
    const d = r.data || {};
    if (!d.active || !d.until || d.until > Date.now()) continue;
    const guild = client.guilds.cache.get(r.guildId);
    if (!guild) continue;
    const res = await end(guild);
    S.alert(guild, { kind: 'success', title: 'Lockdown ended', lines: [`The timer ran out. ${res.restored} channels are open again.`] });
  }
}

module.exports = { start, end, state, setIgnored, protectNew, expire };

/* ── panel ─────────────────────────────────────────────────────────── */

async function panel(guild, { note = '' } = {}) {
  const ui = require('./ui');
  const K = require('./guardKit');
  const { ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
  const st = await state(guild.id);
  const n = Object.keys(st.channels).length;
  const kept = st.ignored.filter(id => guild.channels.cache.has(id));

  const card = ui.box(st.active ? 'error' : 'base').addSectionComponents(
    K.header('Lockdown', st.active ? 'The server is locked' : 'Stop everyone from talking in one step', 'ld:toggle', st.active, false));
  card.addSeparatorComponents(ui.sep());
  if (note) card.addTextDisplayComponents(ui.text(note));
  card.addTextDisplayComponents(ui.text([
    `**Status**  ${st.active ? 'Locked' : 'Open'}`,
    st.active ? `**Since**  ${S.ago(st.since)}${st.until ? `   **Ends**  ${S.ago(st.until)}` : '   **Ends**  when you end it'}` : null,
    st.active && st.reason ? `**Reason**  ${st.reason}` : null,
    st.active && st.by ? `**Started by**  <@${st.by}>${st.source === 'raid' ? '  (raid detected)' : ''}` : null,
    st.active ? `**Locked channels**  ${n}` : null,
    `**Kept open**  ${kept.length ? kept.slice(0, 15).map(id => `<#${id}>`).join(' ') : 'None'}`,
  ].filter(Boolean).join('\n')));
  card.addTextDisplayComponents(ui.text(ui.sub('Private channels are left alone. Unlocking restores every channel exactly as it was.')));

  const sel = new ChannelSelectMenuBuilder().setCustomId('ld:ignore').setPlaceholder('Channels that stay open…')
    .setChannelTypes(T.GuildText, T.GuildAnnouncement, T.GuildForum, T.GuildVoice, T.GuildStageVoice).setMinValues(0).setMaxValues(25);
  if (kept.length) sel.setDefaultChannels(kept.slice(0, 25));
  const controls = ui.box('base')
    .addActionRowComponents(ui.row(sel))
    .addActionRowComponents(ui.row(
      ui.btn('ld:start', st.active ? 'Change timer' : 'Lock with options', { style: 'danger' }),
      ui.btn('ld:end', 'Unlock', { style: 'success', disabled: !st.active }),
    ));
  return [card, controls];
}

module.exports.panel = panel;
