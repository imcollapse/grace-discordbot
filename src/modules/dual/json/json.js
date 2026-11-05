// grace — /json send  ·  ,json send #channel
// Send a message designed in Discohook (discohook.app) through the bot instead of a webhook.
// Paste the JSON in a form, attach a .json file, or (slash) pick the file in the command.

const D = require('discord.js');
const ui = require('../../../services/ui');
const dh = require('../../../services/discohookJson');

const P = D.PermissionFlagsBits;
const V2 = D.MessageFlags.IsComponentsV2;
const MAX_FILE = 512 * 1024;
const CHANNEL_TYPES = [D.ChannelType.GuildText, D.ChannelType.GuildAnnouncement, D.ChannelType.PublicThread, D.ChannelType.PrivateThread, D.ChannelType.AnnouncementThread];
const HAS_UPLOAD = typeof D.FileUploadBuilder === 'function';

const ID = { paste: 'json_paste', cancel: 'json_cancel' };

/* ── input ─────────────────────────────────────────────────────────── */

async function readFile(att) {
  if (!att) return '';
  if (att.size > MAX_FILE) throw new dh.JsonError('That file is too big (max 512 KB)');
  const res = await fetch(att.url);
  if (!res.ok) throw new dh.JsonError('I couldn\'t download that file');
  return res.text();
}

function buildModal(id) {
  const m = new D.ModalBuilder().setCustomId(id).setTitle('Send Discohook JSON');
  m.addLabelComponents(
    new D.LabelBuilder()
      .setLabel('Message JSON')
      .setDescription('Discohook → JSON Data Editor → copy. Too long? Upload a file below')
      .setTextInputComponent(new D.TextInputBuilder().setCustomId('json').setStyle(D.TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000).setPlaceholder('{"components": [ ... ]}')),
  );
  if (HAS_UPLOAD) {
    m.addLabelComponents(
      new D.LabelBuilder()
        .setLabel('Or upload a .json file')
        .setFileUploadComponent(new D.FileUploadBuilder().setCustomId('file').setRequired(false).setMinValues(0).setMaxValues(1)),
    );
  }
  return m;
}

async function readModal(sub) {
  let text = '';
  try { text = sub.fields.getTextInputValue('json') || ''; } catch (_) { /* empty */ }
  if (!text.trim() && HAS_UPLOAD) {
    try { text = await readFile(sub.fields.getUploadedFiles('file', false)?.first()); } catch (e) { if (e instanceof dh.JsonError) throw e; }
  }
  return text;
}

/* ── sending ───────────────────────────────────────────────────────── */

async function deliver(channel, text, member) {
  const messages = dh.parse(text).map(dh.toPayload);
  const mentionOk = member.permissions.has(P.MentionEveryone);
  const notes = new Set();
  let first = null;
  for (const [i, { payload, notes: n }] of messages.entries()) {
    n.forEach((x) => notes.add(x));
    if (mentionOk) payload.allowedMentions = { parse: ['users', 'roles', 'everyone'] };
    try {
      const sent = await channel.send(payload);
      first ??= sent;
    } catch (e) {
      const where = messages.length > 1 ? ` (message ${i + 1} of ${messages.length})` : '';
      throw new dh.JsonError(`Discord rejected it${where}:\n${dh.explainApiError(e)}`);
    }
  }
  return { first, count: messages.length, notes: [...notes] };
}

function resultCard(channel, res) {
  const lines = [`Sent ${res.count > 1 ? `${res.count} messages` : 'your message'} to ${channel}`];
  if (res.notes.length) lines.push('', ...res.notes.map((n) => `-# ${n}`));
  const box = ui.success(lines.join('\n'));
  if (res.first?.url) box.addActionRowComponents(ui.row(ui.link('Jump to message', res.first.url)));
  return box;
}

/* ── checks ────────────────────────────────────────────────────────── */

function problem(ctx, channel) {
  const member = ctx.member;
  if (!member.permissions.has(P.ManageMessages)) return 'You need **Manage Messages** to use this';
  const mine = channel.permissionsFor(member);
  if (!mine?.has(P.ViewChannel) || !mine.has(P.SendMessages)) return `You can't send messages in ${channel}`;
  const bot = channel.permissionsFor(ctx.guild.members.me);
  if (!bot?.has(P.ViewChannel) || !bot.has(P.SendMessages)) return `I can't send messages in ${channel}`;
  return null;
}

const usage = (ctx, prefix = ',') => ui.send(ctx, ui.card({
  title: 'Send a Discohook message',
  lines: [
    'Design your message at **discohook.app**, open the **JSON Data Editor**, copy the code, then:',
    `- \`${prefix}json send #channel\`  opens a form to paste it`,
    `- \`${prefix}json send #channel\` with a \`.json\` file attached sends the file`,
    '- `/json send` works the same, with a file option',
    '',
    '-# Link buttons work. Discohook\'s own buttons and menus, and images uploaded inside Discohook, are skipped. Use image links instead',
  ],
  rows: [ui.row(ui.link('Open Discohook', 'https://discohook.app'))],
}));

/* ── command ───────────────────────────────────────────────────────── */

module.exports = {
  data: new D.SlashCommandBuilder()
    .setName('json')
    .setDescription('Send a message made in Discohook through the bot')
    .setDefaultMemberPermissions(P.ManageMessages)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('send').setDescription('Send a Discohook JSON message to a channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Where to send it').addChannelTypes(...CHANNEL_TYPES).setRequired(true))
      .addAttachmentOption((o) => o.setName('file').setDescription('A .json file from Discohook (leave empty to paste it)'))),

  name: 'json',
  aliases: ['discohook', 'dh'],
  description: 'Send a message made in Discohook through the bot',
  category: 'utility',

  async execute(ctx, args = []) {
    const slash = ctx.isChatInputCommand?.();
    if (!ctx.guild) return ui.say.error(ctx, 'Use this in a server');

    const sub = (slash ? ctx.options.getSubcommand() : args[0] ?? '').toLowerCase();
    if (sub !== 'send') return usage(ctx);

    let channel;
    if (slash) channel = ctx.options.getChannel('channel', true);
    else {
      const raw = args[1]?.replace(/[<#>]/g, '');
      channel = raw ? (ctx.guild.channels.cache.get(raw) ?? null) : ctx.channel;
      if (!channel) return ui.say.error(ctx, 'I couldn\'t find that channel. Try `json send #channel`');
    }
    if (!channel.isTextBased?.() || channel.isVoiceBased?.()) return ui.say.error(ctx, 'Pick a text channel');
    const bad = problem(ctx, channel);
    if (bad) return ui.say.error(ctx, bad);

    const user = ctx.user ?? ctx.author;
    const file = slash ? ctx.options.getAttachment('file') : ctx.attachments?.first();

    /* a file was given: no form needed */
    if (file) {
      try {
        const res = await deliver(channel, await readFile(file), ctx.member);
        return ui.send(ctx, resultCard(channel, res), { ephemeral: true });
      } catch (e) {
        return ui.say.error(ctx, e instanceof dh.JsonError ? e.message : 'Something went wrong reading that file');
      }
    }

    /* form submitted: answer privately, report the outcome */
    const handleSubmit = async (sub) => {
      await sub.deferReply({ flags: D.MessageFlags.Ephemeral }).catch(() => {});
      try {
        const res = await deliver(channel, await readModal(sub), ctx.member);
        await sub.editReply({ components: [resultCard(channel, res)], flags: V2 }).catch(() => {});
        return true;
      } catch (e) {
        const msg = e instanceof dh.JsonError ? e.message : 'Something went wrong sending that';
        await sub.editReply({ components: [ui.fail(msg)], flags: V2 }).catch(() => {});
        return false;
      }
    };

    /* slash: open the form straight away */
    if (slash) {
      const modalId = `json_modal_${ctx.id}`;
      await ctx.showModal(buildModal(modalId));
      const sub = await ctx.awaitModalSubmit({ time: 600000, filter: (m) => m.customId === modalId && m.user.id === user.id }).catch(() => null);
      if (sub) await handleSubmit(sub);
      return;
    }

    /* prefix: a button opens the form (forms can't open from a text command) */
    const prompt = (disabled = false) => ui.card({
      title: 'Send a Discohook message',
      lines: [`Press **Paste JSON** and paste your message code. It will be sent to ${channel}.`, '-# Or run the command again with a `.json` file attached'],
      rows: [ui.row(
        ui.btn(ID.paste, 'Paste JSON', { style: 'primary', disabled }),
        ui.link('Open Discohook', 'https://discohook.app'),
        ui.btn(ID.cancel, 'Cancel', { disabled }),
      )],
    });

    const msg = await ui.send(ctx, prompt());
    if (!msg?.createMessageComponentCollector) return;
    const collector = msg.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 600000 });

    collector.on('collect', async (i) => {
      try {
        if (i.customId === ID.cancel) {
          collector.stop('cancel');
          await i.update({ components: [prompt(true)], flags: V2 });
          return;
        }
        if (i.customId !== ID.paste) return;
        const modalId = `json_modal_${msg.id}_${i.id}`;
        await i.showModal(buildModal(modalId));
        const sub = await i.awaitModalSubmit({ time: 600000, filter: (m) => m.customId === modalId && m.user.id === user.id }).catch(() => null);
        if (!sub) return;
        if (await handleSubmit(sub)) {
          collector.stop('done');
          await msg.edit({ components: [prompt(true)], flags: V2 }).catch(() => {});
        }
      } catch (_) { /* interaction expired */ }
    });

    collector.on('end', async (_c, reason) => {
      if (reason === 'done' || reason === 'cancel') return;
      try { await msg.edit({ components: [prompt(true)], flags: V2 }); } catch (_) {}
    });
  },
};
