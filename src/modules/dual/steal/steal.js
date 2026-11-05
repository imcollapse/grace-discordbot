/** @author cosmin */

const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const errorContainer = (text) => new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

const EMOJI_FULL_REGEX = /<(a?):([a-zA-Z0-9_]+):(\d+)>/g;

function extractEmojis(text) {
  const found = [];
  const seen = new Set();
  let match;
  EMOJI_FULL_REGEX.lastIndex = 0;
  while ((match = EMOJI_FULL_REGEX.exec(text)) !== null) {
    const animated = match[1] === 'a';
    const name = match[2];
    const id = match[3];
    if (!seen.has(id)) {
      seen.add(id);
      found.push({ animated, name, id });
    }
  }
  return found;
}

function cdnUrl(emoji) {
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`;
}

/* ── look ──────────────────────────────────────────────────────────
 * One quiet container, no accent colour. Success: the emoji themselves are the
 * centrepiece (a thumbnail for one, a row for several), with a single muted
 * line underneath for counts and server slots. */

const T = (c) => new TextDisplayBuilder().setContent(c);
const gap = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false);
const plain = () => new ContainerBuilder();

const MAX_PER_RUN = 20;
const SLOTS = [50, 100, 150, 250]; // per type (static / animated) by boost tier

function slotLine(guild) {
  let cap = SLOTS[Number(guild.premiumTier)] ?? 50;
  if (guild.features?.includes('MORE_EMOJI')) cap = Math.max(cap, 200);
  const all = guild.emojis.cache;
  const animated = all.filter((e) => e.animated).size;
  return `${all.size - animated}/${cap} static  ·  ${animated}/${cap} animated`;
}

function note(title, body) {
  return plain().addTextDisplayComponents(T(`### ${title}\n${body}`));
}

function reasonOf(err) {
  if (err.code === 30008) return 'server emoji limit reached';
  if (err.code === 50013) return 'missing permissions';
  if (err.code === 50035) return 'unsupported emoji or file too large';
  const m = String(err.message || 'unknown error');
  return m.length > 50 ? `${m.slice(0, 50)}…` : m;
}

function resultCard(results, guild, { source, trimmed }) {
  const added = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const box = plain();

  if (!added.length) {
    box.addTextDisplayComponents(T(`### Nothing added\n${failed.map((r) => `\`:${r.name}:\`  ${reasonOf(r.error)}`).join('\n')}`));
    return box;
  }

  if (added.length === 1) {
    const e = added[0];
    box.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(T(`### Added\n**:${e.name}:**\n-# ${source ? `from ${source}  ·  ` : ''}now in ${guild.name}`))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(`${e.url}?size=128`)),
    );
  } else {
    box.addTextDisplayComponents(T(`### Added ${added.length} emojis`));
    box.addTextDisplayComponents(T(added.map((r) => r.tag).join('  ')));
    if (source) box.addTextDisplayComponents(T(`-# from ${source}`));
  }

  if (failed.length) {
    box.addSeparatorComponents(gap());
    box.addTextDisplayComponents(T(`**Couldn't add**\n${failed.map((r) => `\`:${r.name}:\`  ${reasonOf(r.error)}`).join('\n')}`));
  }

  box.addSeparatorComponents(gap());
  box.addTextDisplayComponents(T(`-# ${slotLine(guild)}${trimmed ? `  ·  first ${MAX_PER_RUN} only` : ''}`));
  return box;
}

async function runSteal(target, emojis, guild, member, isSlash, source) {
  const send = (container) => {
    const opts = { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [], repliedUser: false } };
    return isSlash ? target.editReply(opts) : target.reply(opts);
  };

  const missingUserPerm = !member.permissions.has(PermissionFlagsBits.ManageGuildExpressions);
  const missingBotPerm = !guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions);
  if (missingUserPerm || missingBotPerm) {
    return send(note('Missing permission', `${missingUserPerm ? 'You need' : 'I need'} **Manage Expressions** to add emojis.`));
  }

  if (emojis.length === 0) {
    const how = isSlash ? 'Paste custom emojis into the option.' : 'Put them in your message, or reply to a message that has them.';
    return send(note('No emojis found', `${how}\n-# e.g. steal <emoji> <emoji>`));
  }

  const trimmed = emojis.length > MAX_PER_RUN;
  const results = [];
  for (const emoji of emojis.slice(0, MAX_PER_RUN)) {
    try {
      const created = await guild.emojis.create({ attachment: cdnUrl(emoji), name: emoji.name });
      results.push({ name: created.name, success: true, url: cdnUrl(emoji), tag: `<${created.animated ? 'a' : ''}:${created.name}:${created.id}>` });
    } catch (err) {
      results.push({ name: emoji.name, success: false, error: err });
    }
  }

  return send(resultCard(results, guild, { source, trimmed }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('steal')
    .setDescription('Steal emojis and add them to this server')
    .addStringOption(option =>
      option
        .setName('emojis')
        .setDescription('Paste one or more custom emojis (e.g. :Kek: :pog: :sadge:)')
        .setRequired(true)
    ),

  name: 'steal',
  aliases: ['stealemoji', 'stealmoji', 'addemoji'],
  description: 'Steal emojis and add them to this server',
  category: 'general',

  async execute(interactionOrMessage, args = []) {
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const guild = interactionOrMessage.guild;
    const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;

    if (!guild) {
      const container = errorContainer('> This command can only be used inside a server.');
      const opts = { components: [container], flags: MessageFlags.IsComponentsV2 };
      if (isSlash) return interactionOrMessage.reply({ ...opts, ephemeral: true });
      return interactionOrMessage.reply(opts);
    }

    if (isSlash) {
      await interactionOrMessage.deferReply();
      const input = interactionOrMessage.options.getString('emojis');
      const emojis = extractEmojis(input);
      return runSteal(interactionOrMessage, emojis, guild, member, true, null);
    }

    // --- Prefix path ---
    const message = interactionOrMessage;
    const inlineText = args.join(' ');
    const inlineEmojis = extractEmojis(inlineText);

    // Also check replied message for emojis
    let replyEmojis = [];
    let source = null;
    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        replyEmojis = extractEmojis(replied.content);
        if (replyEmojis.length > 0) source = `replied message`;
      } catch { /* ignore */ }
    }

    // Merge: inline first, then reply (dedup by ID)
    const seen = new Set(inlineEmojis.map(e => e.id));
    const combined = [...inlineEmojis];
    for (const e of replyEmojis) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        combined.push(e);
      }
    }

    return runSteal(message, combined, guild, member, false, source);
  }
};
