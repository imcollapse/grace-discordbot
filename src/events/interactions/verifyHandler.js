// grace · verification interactions.
//   verify:go | enter | new | modal      members solving the captcha (public)
//   vfy:<action>                         the setup panel (Manage Server)

const { MessageFlags, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require('discord.js');
const ui = require('../../services/ui');
const V = require('../../services/verify');

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;
const NO_PING = { parse: [] };
const say = (i, comp) => i.reply({ components: [comp], flags: V2 | EPHEMERAL, allowedMentions: NO_PING });
const when = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

/* ── members ───────────────────────────────────────────────────────── */

async function member(i) {
  const c = await V.config(i.guildId);
  if (!c?.enabled || !c.roleId) { await say(i, V.warn('Verification is not turned on here.')); return null; }
  if (!i.member.roles.cache.has(c.roleId)) { await say(i, V.ok('You are already verified.')); return null; }
  const until = V.lockedUntil(i.guild, i.user);
  if (until) { await say(i, V.bad('Too many wrong codes.', `Try again ${when(until)}.`)); return null; }
  return c;
}

async function publicFlow(i) {
  const id = i.customId;

  if (i.isButton() && id === 'verify:go') {
    const c = await member(i); if (!c) return true;
    await i.reply({ ...V.challenge(i.guild, i.user, c), flags: V2 | EPHEMERAL });
    return true;
  }

  if (i.isButton() && id === 'verify:new') {
    const c = await member(i); if (!c) return true;
    await i.update({ ...V.challenge(i.guild, i.user, c), attachments: [] }).catch(() => {});
    return true;
  }

  if (i.isButton() && id === 'verify:enter') {
    const c = await member(i); if (!c) return true;
    await i.showModal(V.codeModal());
    return true;
  }

  if (i.isModalSubmit() && id === 'verify:modal') {
    const c = await member(i); if (!c) return true;
    const res = V.check(i.guild, i.user, i.fields.getTextInputValue('code'));

    if (res.status === 'pass') {
      await V.pass(i.member);
      const done = ui.box('success').addTextDisplayComponents(ui.text(`${ui.emojis.success}  You are verified. Welcome to **${i.guild.name}**.`));
      if (i.isFromMessage()) await i.update({ components: [done], files: [], attachments: [], flags: V2 });
      else await i.reply({ components: [done], flags: V2 | EPHEMERAL });
      return true;
    }
    if (res.status === 'locked') {
      if (res.out) await V.failed(i.guild, i.user);
      await say(i, V.bad('Too many wrong codes.', `Try again ${when(res.until)}.`));
      return true;
    }
    if (res.status === 'none') {
      await i.reply({ ...V.challenge(i.guild, i.user, c, { note: `${ui.emojis.warning}  That code expired. Here is a new one.` }), flags: V2 | EPHEMERAL });
      return true;
    }
    const next = V.challenge(i.guild, i.user, c, { note: `${ui.emojis.error}  Wrong code. Here is a new one.` });
    if (i.isFromMessage()) await i.update({ ...next, attachments: [] });
    else await i.reply({ ...next, flags: V2 | EPHEMERAL });
    return true;
  }
  return false;
}

/* ── setup panel ───────────────────────────────────────────────────── */

const redraw = async (i, view = 'main', note = '') =>
  i.update({ components: await V.panel(i.guild, await V.config(i.guildId), { view, note }), flags: V2, allowedMentions: NO_PING });

/** After a slow action: acknowledge first, then edit. */
async function slowRedraw(i, work, view = 'main') {
  await i.deferUpdate();
  const note = await work();
  await i.editReply({ components: await V.panel(i.guild, await V.config(i.guildId), { view, note }), flags: V2, allowedMentions: NO_PING });
}

async function adminFlow(i) {
  const [, action] = i.customId.split(':');
  if (!i.inGuild()) return true;
  if (!V.canManage(i.member)) { await say(i, ui.fail('You need the **Manage Server** permission.')); return true; }
  const guild = i.guild;
  const gid = i.guildId;
  const c = await V.config(gid);
  const value = i.values?.[0];

  if (i.isModalSubmit()) {
    if (action !== 'm_text') return true;
    const text = i.fields.getTextInputValue('text').trim().slice(0, 1500);
    await V.change(gid, { message: text || null });
    await redraw(i, 'main', `${ui.emojis.success} Panel text saved. Press **Send panel** to post it.`);
    return true;
  }

  switch (action) {
    case 'toggle': {
      if (!c?.enabled) {
        if (!c?.channelId || !c?.roleId) { await say(i, V.warn('Pick a verify channel and an Unverified role first, or press **Auto setup**.')); return true; }
        const role = guild.roles.cache.get(c.roleId);
        if (!role) { await say(i, V.bad('The Unverified role was deleted. Pick another one.')); return true; }
        if (guild.members.me.roles.highest.comparePositionTo(role) <= 0) { await say(i, V.bad('Move my role above the Unverified role first.')); return true; }
      }
      const on = !c?.enabled;
      await V.change(gid, { enabled: on });
      await redraw(i, 'main', on ? `${ui.emojis.success} Verification is on. New members are checked.` : 'Verification is off.');
      return true;
    }
    case 'channel': await V.change(gid, { channelId: i.channels.first()?.id ?? null }); await redraw(i); return true;
    case 'role': {
      const r = i.roles.first();
      if (r && (r.managed || r.id === gid)) { await say(i, V.bad('Pick a normal role.')); return true; }
      await V.change(gid, { roleId: r?.id ?? null });
      await redraw(i, 'main', r ? `${ui.emojis.warning} Press **Hide channels** so this role loses access everywhere.` : '');
      return true;
    }
    case 'verified': await V.change(gid, { verifiedId: i.roles.first()?.id ?? null }); await redraw(i); return true;
    case 'log': await V.change(gid, { logId: i.channels.first()?.id ?? null }); await redraw(i, 'more'); return true;
    case 'attempts': await V.change(gid, { attempts: Number(value) || 3 }); await redraw(i, 'more'); return true;
    case 'length': await V.change(gid, { length: Number(value) || 5 }); await redraw(i, 'more'); return true;
    case 'kick': {
      const mins = Number(value) || 0;
      if (mins && !guild.members.me.permissions.has('KickMembers')) { await say(i, V.bad('I need the **Kick Members** permission for that.')); return true; }
      await V.change(gid, { kickAfter: mins });
      await redraw(i, 'more');
      return true;
    }
    case 'more': await redraw(i, 'more'); return true;
    case 'back': await redraw(i, 'main'); return true;

    case 'auto': {
      const miss = V.missingPerms(guild);
      if (miss.length) { await say(i, V.bad(`I need **${miss.join('** and **')}** to do that.`)); return true; }
      await slowRedraw(i, async () => {
        let role = guild.roles.cache.get(c?.roleId);
        if (!role) role = await V.createRole(guild);
        let channel = guild.channels.cache.get(c?.channelId);
        if (!channel) channel = await V.createChannel(guild, role);
        await V.change(gid, { roleId: role.id, channelId: channel.id });
        const res = await V.syncChannels(guild, role, channel.id);
        return `${ui.emojis.success} ${role} and ${channel} are ready. Hid ${res.done} channels${res.failed ? ` (${res.failed} I couldn't change)` : ''}. Turn it on when you like.`;
      });
      return true;
    }
    case 'sync': {
      const role = guild.roles.cache.get(c?.roleId);
      if (!role) { await say(i, V.warn('Pick the Unverified role first.')); return true; }
      await slowRedraw(i, async () => {
        const res = await V.syncChannels(guild, role, c.channelId);
        return `${ui.emojis.success} Hid ${res.done} channels from ${role}${res.failed ? ` (${res.failed} I couldn't change)` : ''}.`;
      });
      return true;
    }
    case 'post': {
      if (!c?.channelId) { await say(i, V.warn('Pick a verify channel first.')); return true; }
      await i.deferUpdate();
      const res = await V.postPanel(guild, c);
      await i.editReply({ components: await V.panel(guild, await V.config(gid), { note: res.ok ? `${ui.emojis.success} Panel sent to <#${c.channelId}>.` : `${ui.emojis.error} ${res.error}` }), flags: V2, allowedMentions: NO_PING });
      return true;
    }
    case 'test': {
      await i.reply({ ...V.challenge(guild, i.user, c, { preview: true }), flags: V2 | EPHEMERAL });
      return true;
    }
    case 'text': {
      const modal = new ModalBuilder().setCustomId('vfy:m_text').setTitle('Panel text')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('text').setLabel('Text shown above the Verify button').setStyle(TextInputStyle.Paragraph)
            .setRequired(false).setMaxLength(1500).setValue((c?.message || V.DEFAULT_TEXT).slice(0, 1500))));
      await i.showModal(modal);
      return true;
    }
    case 'reset': await i.update({ components: V.confirmReset(), flags: V2 }); return true;
    case 'no': await redraw(i); return true;
    case 'yes':
      await i.deferUpdate();
      await V.reset(guild);
      await i.editReply({ components: await V.panel(guild, null, { note: `${ui.emojis.success} Verification was reset.` }), flags: V2 });
      return true;
  }
  return false;
}

async function handle(i) {
  const id = i.customId;
  if (!id) return false;
  if (id.startsWith('verify:')) {
    if (id === 'verify:noop' || id === 'verify:noop2') return true;
    if (!i.inGuild()) return true;
    return publicFlow(i);
  }
  if (id.startsWith('vfy:')) return adminFlow(i);
  return false;
}

module.exports = { handle };
