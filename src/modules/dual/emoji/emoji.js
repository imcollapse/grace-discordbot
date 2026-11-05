// grace — ,emoji  ·  /emoji
// Enlarge custom emojis. Give some in the command, or reply to a message that has them
// (in its text or its reactions). Page through them with the arrows; "Add" copies one into the server.

const D = require('discord.js');
const ui = require('../../../services/ui');

const V2 = D.MessageFlags.IsComponentsV2;
const EMOJI_RE = /<(a?):([a-zA-Z0-9_]{2,32}):(\d{15,25})>/g;
const MAX = 25;
const ID = { prev: 'emoji_prev', next: 'emoji_next', page: 'emoji_page', add: 'emoji_add' };

function extract(text, into, seen) {
  EMOJI_RE.lastIndex = 0;
  let m;
  while ((m = EMOJI_RE.exec(text ?? '')) !== null) {
    if (seen.has(m[3])) continue;
    seen.add(m[3]);
    into.push({ animated: m[1] === 'a', name: m[2], id: m[3] });
  }
}

const url = (e, size = 512) => `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=${size}`;
const tag = (e) => `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;
const created = (e) => Math.floor(D.SnowflakeUtil.timestampFrom(e.id) / 1000);

/* ── card ──────────────────────────────────────────────────────────── */

function render({ list, at, guild, disabled = false }) {
  const e = list[at];
  const here = guild.emojis.cache.has(e.id);

  const box = new D.ContainerBuilder();

  box.addSectionComponents(
    new D.SectionBuilder()
      .addTextDisplayComponents(ui.text(
        `### :${e.name}:\n-# ${e.animated ? 'Animated' : 'Static'}  ·  created <t:${created(e)}:D>${here ? '  ·  in this server' : ''}`,
      ))
      .setButtonAccessory(ui.btn(ID.add, here ? 'In server' : 'Add', { style: here ? 'secondary' : 'primary', disabled: disabled || here })),
  );

  box.addMediaGalleryComponents(
    new D.MediaGalleryBuilder().addItems(new D.MediaGalleryItemBuilder().setURL(url(e)).setDescription(`:${e.name}:`)),
  );

  box.addTextDisplayComponents(ui.text(`-# \`${e.id}\``));

  const controls = [];
  if (list.length > 1) {
    controls.push(
      ui.btn(ID.prev, null, { emoji: '◀️', disabled: disabled || at === 0 }),
      ui.btn(ID.page, `${at + 1} / ${list.length}`, { disabled: true }),
      ui.btn(ID.next, null, { emoji: '▶️', disabled: disabled || at === list.length - 1 }),
    );
  }
  controls.push(ui.link('Original', url(e, 4096)));
  box.addActionRowComponents(ui.row(...controls));
  return box;
}

const note = (title, body) => new D.ContainerBuilder().addTextDisplayComponents(ui.text(`### ${title}\n${body}`));

/* ── command ───────────────────────────────────────────────────────── */

module.exports = {
  data: new D.SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Enlarge custom emojis')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('emojis').setDescription('One or more custom emojis').setRequired(true)),

  name: 'emoji',
  aliases: ['enlarge', 'jumbo', 'bigemoji'],
  description: 'Enlarge custom emojis',
  category: 'utility',

  async execute(ctx, args = []) {
    const slash = ctx.isChatInputCommand?.();
    if (!ctx.guild) return ui.send(ctx, note('Server only', 'Use this inside a server.'), { ephemeral: true });

    const list = [];
    const seen = new Set();
    extract(slash ? ctx.options.getString('emojis') : args.join(' '), list, seen);

    if (!slash && ctx.reference?.messageId) {
      const ref = await ctx.fetchReference().catch(() => null);
      if (ref) {
        extract(ref.content, list, seen);
        for (const r of ref.reactions?.cache?.values() ?? []) {
          if (r.emoji.id && !seen.has(r.emoji.id)) {
            seen.add(r.emoji.id);
            list.push({ animated: !!r.emoji.animated, name: r.emoji.name ?? 'emoji', id: r.emoji.id });
          }
        }
      }
    }
    list.splice(MAX);

    if (!list.length) {
      return ui.send(ctx, note('No emojis found', slash
        ? 'Paste one or more custom emojis.'
        : 'Put custom emojis in your message, or reply to one that has them.\n-# e.g. emoji <emoji> <emoji>'), { ephemeral: true });
    }

    const user = ctx.user ?? ctx.author;
    let at = 0;
    const draw = (disabled = false) => [render({ list, at, guild: ctx.guild, disabled })];

    const msg = await ui.send(ctx, draw());
    if (!msg?.createMessageComponentCollector) return;
    const collector = msg.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 300000 });

    collector.on('collect', async (i) => {
      try {
        if (i.customId === ID.prev) { at = Math.max(0, at - 1); return await i.update({ components: draw(), flags: V2 }); }
        if (i.customId === ID.next) { at = Math.min(list.length - 1, at + 1); return await i.update({ components: draw(), flags: V2 }); }
        if (i.customId !== ID.add) return;

        const e = list[at];
        await i.deferReply({ flags: D.MessageFlags.Ephemeral });
        const need = D.PermissionFlagsBits.ManageGuildExpressions;
        if (!i.member.permissions.has(need)) return await i.editReply({ components: [note('Missing permission', 'You need **Manage Expressions** to add emojis.')], flags: V2 });
        if (!ctx.guild.members.me.permissions.has(need)) return await i.editReply({ components: [note('Missing permission', 'I need **Manage Expressions** to add emojis.')], flags: V2 });
        try {
          const made = await ctx.guild.emojis.create({ attachment: url(e, 128), name: e.name });
          await i.editReply({ components: [note('Added', `${tag(made)}  **:${made.name}:** is now in ${ctx.guild.name}`)], flags: V2 });
          await msg.edit({ components: draw(), flags: V2 }).catch(() => {});
        } catch (err) {
          const why = err.code === 30008 ? 'The server has no emoji slots left.' : err.code === 50035 ? 'That emoji can\'t be copied.' : 'Something went wrong adding it.';
          await i.editReply({ components: [note('Couldn\'t add', why)], flags: V2 });
        }
      } catch (_) { /* interaction expired */ }
    });

    collector.on('end', async () => {
      try { await msg.edit({ components: draw(true), flags: V2 }); } catch (_) {}
    });
  },
};
