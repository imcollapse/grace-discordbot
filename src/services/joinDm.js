// grace · join DM. A message (text, saved embed or saved container) sent to every new member,
// with a link button that names the server it came from.

const { SectionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const ui = require('./ui');
const emojis = require('../media/emojis.json');
const G = require('./greeter');
const { applyVars } = require('./embedVars');
const { ctxFromMember } = require('./embedVars');
const { JoinDm } = require('../database/schemas');

const DEFAULT = 'Welcome to **{server}**, {user}! We are glad to have you.';
const MAX = 2000;
const V2 = MessageFlags.IsComponentsV2;

const cache = new Map();
const TTL = 30_000;
async function read(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.ts < TTL) return hit.row;
  const row = await JoinDm.findByPk(guildId);
  cache.set(guildId, { ts: Date.now(), row });
  return row;
}
const bust = (g) => cache.delete(g);
async function change(guildId, patch) {
  const row = (await JoinDm.findByPk(guildId)) ?? await JoinDm.create({ guildId, message: DEFAULT });
  await row.update(patch);
  bust(guildId);
  return row;
}

const validLink = (s) => { try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The message plus its link button. @returns { payload, problem } */
async function build(guild, member, row) {
  const out = await G.compose(guild, row?.message || DEFAULT, ctxFromMember(member, null));
  if (!out.payload) return { payload: null, problem: out.problem ?? 'Nothing to send.' };

  const url = row?.link && validLink(row.link) ? row.link : `https://discord.com/channels/${guild.id}`;
  const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(clip(`Sent from ${guild.name}`, 80));
  const line = new ActionRowBuilder().addComponents(button);

  const payload = { ...out.payload };
  payload.components = [...(payload.components ?? []), line];
  return { payload, problem: out.problem };
}

/** Called when someone joins. Never throws. */
async function onJoin(member) {
  if (member.user.bot) return;
  const row = await read(member.guild.id);
  if (!row?.enabled) return;
  const { payload } = await build(member.guild, member, row);
  if (!payload) return;
  try {
    await member.send({ ...payload, allowedMentions: { parse: [] } });
    JoinDm.increment('sent', { where: { guildId: member.guild.id } }).catch(() => {});
  } catch {
    JoinDm.increment('failed', { where: { guildId: member.guild.id } }).catch(() => {});   // DMs closed
  }
}

/* ── panel ─────────────────────────────────────────────────────────── */

const quote = (s) => s.split('\n').map(l => `> ${l}`).join('\n');

async function panel(guild, row, { member, note = '' } = {}) {
  const cur = row ?? { enabled: false, message: DEFAULT, link: null, sent: 0, failed: 0 };
  const designs = await G.savedDesigns(guild.id);
  const tags = G.tagsOf(cur.message);
  const found = {
    embed: tags.embed ? designs.embeds.includes(tags.embed) : undefined,
    container: tags.container ? designs.containers.includes(tags.container) : undefined,
  };
  const ctx = member ? ctxFromMember(member, null) : { guild };
  const shown = applyVars(G.bare(cur.message ?? DEFAULT), ctx).trim();

  const toggle = ui.btn('jdm:toggle', cur.enabled ? 'Disable' : 'Enable', { style: cur.enabled ? 'danger' : 'success' });
  const head = new SectionBuilder().addTextDisplayComponents(ui.text('### Join DM\n-# Sent to every new member in their DMs')).setButtonAccessory(toggle);

  const delivery = (() => {
    const { container, embed } = tags;
    const text = G.bare(cur.message ?? '') ? 'Text + ' : '';
    if (container) return `${text}Container \`${container}\`${found.container === false ? ' · **not found**' : ''}`;
    if (embed) return `${text}Embed \`${embed}\`${found.embed === false ? ' · **not found**' : ''}`;
    return 'Text only';
  })();

  const info = [
    `**Status**  ${cur.enabled ? `${emojis.toggle_on} On` : `${emojis.toggle_off} Off`}`,
    `**Delivery**  ${delivery}`,
    `**Button**  Sent from **${clip(guild.name, 40)}** → ${cur.link ? `<${cur.link}>` : 'the server'}`,
    `**Delivered**  ${cur.sent}   **Closed DMs**  ${cur.failed}`,
  ].join('\n');

  const card = ui.box('base').addSectionComponents(head).addSeparatorComponents(ui.sep());
  if (note) card.addTextDisplayComponents(ui.text(note));
  card.addTextDisplayComponents(ui.text(info)).addSeparatorComponents(ui.sep(false));
  card.addTextDisplayComponents(ui.text(`**Message**\n${shown ? quote(clip(shown, 420)) : ui.sub('Only the attached design is sent.')}`));
  card.addTextDisplayComponents(ui.text(ui.sub('Tags: {embed:name} and {container:name}')));

  const opts = [{ label: 'Text only', value: 'none', description: 'Send just the message', default: !tags.embed && !tags.container }];
  for (const n of designs.embeds.slice(0, 11)) opts.push({ label: `Embed · ${n}`, value: `e:${n}`, description: 'Saved embed', default: tags.embed === n });
  for (const n of designs.containers.slice(0, 12)) opts.push({ label: `Container · ${n}`, value: `c:${n}`, description: 'Saved container', default: tags.container === n });

  const controls = ui.box('base')
    .addActionRowComponents(ui.row(ui.select('jdm:attach', 'Attach an embed or container…', opts)))
    .addActionRowComponents(ui.row(
      ui.btn('jdm:msg', 'Set message', { style: 'primary' }),
      ui.btn('jdm:link', 'Button link'),
      ui.btn('jdm:prev', 'Preview'),
      ui.btn('jdm:dm', 'Send to me'),
    ))
    .addActionRowComponents(ui.row(
      ui.btn('jdm:vars', 'Variables'),
      ui.btn('jdm:reset', 'Reset', { style: 'danger' }),
    ));
  return [card, controls];
}

const confirmReset = () => [ui.box('warning')
  .addTextDisplayComponents(ui.text('### Reset join DM?\n-# The message, link and switch are cleared.'))
  .addActionRowComponents(ui.row(ui.btn('jdm:yes', 'Reset', { style: 'danger' }), ui.btn('jdm:no', 'Cancel')))];

const canManage = G.canManage;

module.exports = { DEFAULT, MAX, V2, read, bust, change, build, onJoin, panel, confirmReset, validLink, canManage };
