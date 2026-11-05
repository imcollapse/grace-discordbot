// grace · feedback / reviews.
//   The panel shows the server's average rating and has 1–5 star buttons. A star opens a short form,
//   the review is posted as a card in the review channel, saved, and the panel's numbers update.

const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType,
  MediaGalleryBuilder, MediaGalleryItemBuilder, PermissionFlagsBits,
} = require('discord.js');
const ui = require('./ui');
const { icon, pre } = require('./icons');
const db = require('../database/feedback');

const V2 = MessageFlags.IsComponentsV2;
const NO = { parse: [] };
const COOLDOWN = 60 * 60 * 1000;           // one review per person per hour
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const note = (kind, text, footer) => ui.notice(kind, text, footer ? { footer } : {});

/* ── small visuals ─────────────────────────────────────────────────── */

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const bar = (n, total, width = 10) => { const f = total ? Math.round((n / total) * width) : 0; return '▰'.repeat(f) + '▱'.repeat(width - f); };
const avgText = (s) => (s.count ? s.avg.toFixed(1) : '–');

function distribution(s) {
  return [5, 4, 3, 2, 1].map(r => `\`${r}★\` ${bar(s.dist[r - 1], s.count)} ${s.dist[r - 1]}`).join('\n');
}
const isImage = (u) => { try { const p = new URL(u); return /^https?:$/.test(p.protocol) && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(p.pathname + p.search); } catch { return false; } };

const starButtons = (disabled = false) => ui.row(
  ...[1, 2, 3, 4, 5].map(n => ui.btn(`fb_rate_${n}`, `${n} ★`, { style: n >= 4 ? 'success' : n === 3 ? 'secondary' : 'danger', disabled })),
);
const writeButton = (disabled = false) => ui.row(ui.btn('open_feedback_modal', 'Write a review', { disabled }));

/* ── cards ─────────────────────────────────────────────────────────── */

function panelCard(guild, s) {
  const c = ui.box('base');
  const head = [`## ${pre('success', '')}${clip(guild.name, 60)} reviews`];
  head.push(s.count ? `# ${avgText(s)}  ${stars(Math.round(s.avg))}\n${s.count} review${s.count === 1 ? '' : 's'}` : 'No reviews yet. Be the first to share how it went.');
  const icn = guild.iconURL?.({ extension: 'png', size: 128 });
  c.addSectionComponents(ui.section(head.join('\n'), icn || guild.client?.user?.displayAvatarURL?.({ extension: 'png', size: 128 })));
  if (s.count) { c.addSeparatorComponents(ui.sep()); c.addTextDisplayComponents(ui.text(distribution(s))); }
  c.addSeparatorComponents(ui.sep());
  c.addTextDisplayComponents(ui.text('How was your experience? Pick a star to start, then add a few words.'));
  c.addActionRowComponents(starButtons(), writeButton());
  return c;
}

function reviewCard(user, review, s, { rolePing = null } = {}) {
  const c = ui.box('base');
  if (rolePing) c.addTextDisplayComponents(ui.text(`<@&${rolePing}>`));
  const name = user.displayName ?? user.globalName ?? user.username;
  c.addSectionComponents(ui.section(
    `### ${stars(review.rating)}  ${review.rating}/5\n> ${clip(review.body, 1500).replace(/\n/g, '\n> ')}\n\n**${clip(name, 40)}** · <t:${Math.floor(new Date(review.created_at ?? Date.now()).getTime() / 1000)}:R>`,
    user.displayAvatarURL?.({ extension: 'png', size: 256 })));
  if (review.image) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(review.image)));
  c.addTextDisplayComponents(ui.text(ui.sub(`Review #${review.id}${s.count ? ` · server average ${avgText(s)} from ${s.count}` : ''}`)));
  c.addActionRowComponents(starButtons(), writeButton());
  return c;
}

async function statsCard(guild) {
  const [s, recent] = await Promise.all([db.stats(guild.id), db.recent(guild.id, 3)]);
  if (!s.count) return note('info', 'No reviews yet.', 'They show up here once people use the panel');
  const c = ui.box('base');
  c.addSectionComponents(ui.section(`## Reviews\n# ${avgText(s)}  ${stars(Math.round(s.avg))}\n${s.count} review${s.count === 1 ? '' : 's'}`, guild.iconURL?.({ extension: 'png', size: 128 }) || guild.client?.user?.displayAvatarURL?.({ extension: 'png', size: 128 })));
  c.addSeparatorComponents(ui.sep());
  c.addTextDisplayComponents(ui.text(distribution(s)));
  if (recent.length) {
    c.addSeparatorComponents(ui.sep());
    c.addTextDisplayComponents(ui.text(`**Latest**\n${recent.map(r => `${stars(r.rating)} <@${r.user_id}> · ${clip(r.body.replace(/\s+/g, ' '), 90)}`).join('\n')}`));
  }
  return c;
}

/* ── setup (one screen) ────────────────────────────────────────────── */

const sessions = new Map();                 // userId → { review, log, role }

function setupCard(state, existing) {
  const c = ui.box('base').addTextDisplayComponents(ui.text('### Feedback setup'));
  const line = (label, v, ph) => `**${label}:** ${v ? v : ph}`;
  c.addTextDisplayComponents(ui.text([
    line('Review channel', state.review && `<#${state.review}>`, 'not chosen yet'),
    line('Log channel', state.log && `<#${state.log}>`, 'none'),
    line('Ping role', state.role && `<@&${state.role}>`, 'none'),
  ].join('\n')));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('feedback_setup_review').setPlaceholder('Review channel: where reviews are posted').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1)));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('feedback_setup_log').setPlaceholder('Log channel (optional)').setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1)));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder().setCustomId('feedback_setup_role').setPlaceholder('Role to ping on new reviews (optional)').setMinValues(0).setMaxValues(1)));
  c.addActionRowComponents(ui.row(
    ui.btn('feedback_setup_save', existing ? 'Save' : 'Save', { style: 'secondary', disabled: !state.review }),
    ui.btn('feedback_setup_panel', 'Save and send panel', { style: 'success', disabled: !state.review }),
  ));
  return c;
}

/* ── actions ───────────────────────────────────────────────────────── */

const isAdmin = (ctx) => !!ctx.member?.permissions?.has?.(PermissionFlagsBits.Administrator);

/** Post (or refresh) the panel in the review channel. @returns the channel or throws a short message */
async function sendPanel(guild) {
  const cfg = await db.getConfig(guild.id);
  if (!cfg) throw new Error('Feedback is not set up yet. Run the setup first.');
  const channel = guild.channels.cache.get(cfg.review_channel_id);
  if (!channel) throw new Error('I cannot find the review channel. Run the setup again.');
  const s = await db.stats(guild.id);
  const msg = await channel.send({ components: [panelCard(guild, s)], flags: V2, allowedMentions: NO });
  await db.setPanel(guild.id, channel.id, msg.id);
  return { channel, msg };
}

/** After a new review, update the numbers on the panel that is already out. */
async function refreshPanel(guild) {
  const cfg = await db.getConfig(guild.id);
  if (!cfg?.panel_channel_id || !cfg.panel_message_id) return;
  const ch = guild.channels.cache.get(cfg.panel_channel_id);
  const msg = await ch?.messages.fetch(cfg.panel_message_id).catch(() => null);
  if (msg) await msg.edit({ components: [panelCard(guild, await db.stats(guild.id))], flags: V2, allowedMentions: NO }).catch(() => {});
}

function modal(rating) {
  const m = new ModalBuilder().setCustomId(rating ? `fb_modal_${rating}` : 'feedback_modal').setTitle(rating ? `Your review: ${stars(rating)}` : 'Write a review');
  if (!rating) m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('feedback_rating').setLabel('Rating (1 to 5)').setPlaceholder('5').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(1).setRequired(true)));
  m.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('feedback_text').setLabel('What did you think?').setPlaceholder('A few words about your experience…').setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(1500).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('feedback_image').setLabel('Picture link (optional)').setPlaceholder('https://…/screenshot.png').setStyle(TextInputStyle.Short).setMaxLength(400).setRequired(false)),
  );
  return m;
}

async function submit(interaction, rating) {
  const reply = (comp) => interaction.reply({ components: [comp], flags: V2 | MessageFlags.Ephemeral, allowedMentions: NO });
  const guild = interaction.guild;
  const n = rating ?? parseInt(interaction.fields.getTextInputValue('feedback_rating'), 10);
  if (!(n >= 1 && n <= 5)) return reply(note('warning', 'The rating has to be a number from 1 to 5.'));
  const body = interaction.fields.getTextInputValue('feedback_text').trim();
  const rawImage = (interaction.fields.getTextInputValue('feedback_image') || '').trim();
  const image = rawImage && isImage(rawImage) ? rawImage : null;

  const cfg = await db.getConfig(guild.id);
  const channel = cfg && guild.channels.cache.get(cfg.review_channel_id);
  if (!channel) return reply(note('error', 'Reviews are not set up here right now. Ask an admin to run the feedback setup.'));

  const last = await db.lastReviewAt(guild.id, interaction.user.id);
  if (last && Date.now() - new Date(last).getTime() < COOLDOWN) {
    const when = Math.floor((new Date(last).getTime() + COOLDOWN) / 1000);
    return reply(note('warning', `You already left a review a moment ago. You can write another <t:${when}:R>.`));
  }

  const review = await db.addReview(guild.id, interaction.user.id, n, body, image);
  const s = await db.stats(guild.id);
  const member = interaction.member ?? interaction.user;
  const msg = await channel.send({
    components: [reviewCard(member.displayName ? member : interaction.user, review, s, { rolePing: cfg.ping_role_id })],
    flags: V2, allowedMentions: cfg.ping_role_id ? { roles: [cfg.ping_role_id] } : NO,
  }).catch((e) => { console.error('[feedback] post:', e.message); return null; });
  if (msg) await db.setReviewMessage(review.id, msg.id).catch(() => {});

  if (cfg.log_channel_id) {
    const log = guild.channels.cache.get(cfg.log_channel_id);
    if (log) {
      const c = ui.box('base').addTextDisplayComponents(ui.text(`### New review #${review.id}`));
      c.addTextDisplayComponents(ui.text(`**${interaction.user.username}** (${interaction.user.id})\n${stars(n)} ${n}/5\n${clip(body, 900)}`));
      if (msg) c.addActionRowComponents(ui.row(ui.link('Jump to review', msg.url)));
      await log.send({ components: [c], flags: V2, allowedMentions: NO }).catch(() => {});
    }
  }
  await refreshPanel(guild);
  const done = note('success', 'Thanks! Your review is posted.', image || !rawImage ? null : 'The picture link was skipped: it has to end in .png, .jpg, .gif or .webp');
  if (msg) done.addActionRowComponents(ui.row(ui.link('See your review', msg.url)));
  return reply(done);
}

/* ── commands (shared by the prefix and slash versions) ────────────── */

async function run(ctx, sub) {
  const send = (c) => ui.send(ctx, c, { extra: { allowedMentions: NO } });
  const prefix = ctx.usedPrefix ?? require('../settings').PREFIX;
  if (!ctx.guild) return;
  const needAdmin = () => send(note('error', 'You need **Administrator** to do that.'));

  if (sub === 'setup') {
    if (!isAdmin(ctx)) return needAdmin();
    const cfg = await db.getConfig(ctx.guild.id);
    const user = ctx.user ?? ctx.author;
    sessions.set(user.id, { review: cfg?.review_channel_id ?? null, log: cfg?.log_channel_id ?? null, role: cfg?.ping_role_id ?? null });
    return send(setupCard(sessions.get(user.id), !!cfg));
  }
  if (sub === 'panel') {
    if (!isAdmin(ctx)) return needAdmin();
    try { const { channel, msg } = await sendPanel(ctx.guild); const c = note('success', `Panel sent to ${channel}.`); c.addActionRowComponents(ui.row(ui.link('Jump to panel', msg.url))); return send(c); }
    catch (e) { return send(note('error', e.message || 'I could not send the panel.', `${prefix}feedback setup`)); }
  }
  if (sub === 'stats' || sub === 'reviews') return send(await statsCard(ctx.guild));
  if (sub === 'config') {
    const cfg = await db.getConfig(ctx.guild.id);
    if (!cfg) return send(note('info', 'Feedback is not set up on this server.', `${prefix}feedback setup`));
    const c = ui.box('base').addTextDisplayComponents(ui.text('### Feedback settings'));
    c.addTextDisplayComponents(ui.text([
      `**Review channel:** ${ctx.guild.channels.cache.get(cfg.review_channel_id) ?? 'not found'}`,
      `**Log channel:** ${cfg.log_channel_id ? (ctx.guild.channels.cache.get(cfg.log_channel_id) ?? 'not found') : 'none'}`,
      `**Ping role:** ${cfg.ping_role_id ? `<@&${cfg.ping_role_id}>` : 'none'}`,
      `**Panel:** ${cfg.panel_message_id ? `[jump](https://discord.com/channels/${ctx.guild.id}/${cfg.panel_channel_id}/${cfg.panel_message_id})` : `not sent yet (${prefix}feedback panel)`}`,
    ].join('\n')));
    return send(c);
  }
  if (sub === 'reset') {
    if (!isAdmin(ctx)) return needAdmin();
    await db.deleteConfig(ctx.guild.id);
    return send(note('success', 'Feedback settings were reset. Saved reviews are kept.'));
  }
  return send(note('info', `Try \`${prefix}feedback setup\`, \`panel\`, \`stats\`, \`config\` or \`reset\`.`));
}

module.exports = { run, sessions, setupCard, sendPanel, refreshPanel, modal, submit, panelCard, reviewCard, stars, isAdmin };
