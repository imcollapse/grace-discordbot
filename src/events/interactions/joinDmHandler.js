// grace · join DM panel. jdm:<action>

const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const ui = require('../../services/ui');
const D = require('../../services/joinDm');
const G = require('../../services/greeter');
const { JoinDm } = require('../../database/schemas');

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;
const NO_PING = { parse: [] };
const say = (i, comp) => i.reply({ components: [comp], flags: V2 | EPHEMERAL, allowedMentions: NO_PING });

const redraw = async (i, note = '') =>
  i.update({ components: await D.panel(i.guild, await D.read(i.guildId), { member: i.member, note }), flags: V2, allowedMentions: NO_PING });

async function handle(i) {
  const id = i.customId;
  if (!id?.startsWith('jdm:')) return false;
  if (!i.inGuild()) return true;
  if (!D.canManage(i.member)) { await say(i, ui.fail('You need the **Manage Server** permission.')); return true; }

  const action = id.split(':')[1];
  const gid = i.guildId;
  const row = await D.read(gid);
  const value = i.values?.[0];

  if (i.isModalSubmit()) {
    if (action === 'm_msg') {
      const text = i.fields.getTextInputValue('message').trim().slice(0, D.MAX);
      if (!text) { await say(i, ui.fail('The message can\'t be empty.')); return true; }
      await D.change(gid, { message: text });
      await redraw(i, `${ui.emojis.success} Message saved.`);
    } else if (action === 'm_link') {
      const url = i.fields.getTextInputValue('link').trim();
      if (url && !D.validLink(url)) { await say(i, ui.fail('That is not a valid link. Start it with `https://`.')); return true; }
      await D.change(gid, { link: url || null });
      await redraw(i, `${ui.emojis.success} ${url ? 'Button link saved.' : 'The button opens the server again.'}`);
    }
    return true;
  }

  switch (action) {
    case 'toggle': {
      const on = !row?.enabled;
      await D.change(gid, { enabled: on, ...(row?.message ? {} : { message: D.DEFAULT }) });
      await redraw(i, on ? `${ui.emojis.success} Join DM is on.` : 'Join DM is off.');
      return true;
    }
    case 'attach': {
      const text = G.bare(row?.message ?? D.DEFAULT);
      let message = text;
      if (value?.startsWith('e:')) message = `${text} {embed:${value.slice(2)}}`.trim();
      if (value?.startsWith('c:')) message = `${text} {container:${value.slice(2)}}`.trim();
      await D.change(gid, { message });
      await redraw(i);
      return true;
    }
    case 'msg': {
      const modal = new ModalBuilder().setCustomId('jdm:m_msg').setTitle('Join DM message')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('message').setLabel('Message (variables and tags work)')
            .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(D.MAX)
            .setValue((row?.message ?? D.DEFAULT).slice(0, D.MAX))));
      await i.showModal(modal);
      return true;
    }
    case 'link': {
      const modal = new ModalBuilder().setCustomId('jdm:m_link').setTitle('Button link')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('link').setLabel('Invite or server link (empty = the server)')
            .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(300).setPlaceholder('https://discord.gg/yourinvite')
            .setValue(row?.link ?? '')));
      await i.showModal(modal);
      return true;
    }
    case 'prev': {
      const { payload, problem } = await D.build(i.guild, i.member, row);
      if (!payload) { await say(i, ui.warn(problem ?? 'Nothing to show.')); return true; }
      await i.reply({ ...payload, flags: (payload.flags ?? 0) | EPHEMERAL, allowedMentions: NO_PING });
      if (problem) await i.followUp({ components: [ui.warn(problem)], flags: V2 | EPHEMERAL, allowedMentions: NO_PING });
      return true;
    }
    case 'dm': {
      const { payload, problem } = await D.build(i.guild, i.member, row);
      if (!payload) { await say(i, ui.warn(problem ?? 'Nothing to send.')); return true; }
      try {
        await i.user.send({ ...payload, allowedMentions: NO_PING });
        await say(i, ui.success('Sent. Check your DMs.'));
      } catch {
        await say(i, ui.fail('I can\'t DM you. Open your DMs for this server and try again.'));
      }
      return true;
    }
    case 'vars':
      await i.reply({ components: await G.variablesCard(i.guild, 'welcome'), flags: V2 | EPHEMERAL, allowedMentions: NO_PING });
      return true;
    case 'reset': await i.update({ components: D.confirmReset(), flags: V2 }); return true;
    case 'no': await redraw(i); return true;
    case 'yes':
      await JoinDm.destroy({ where: { guildId: gid } });
      D.bust(gid);
      await redraw(i, `${ui.emojis.success} Join DM was reset.`);
      return true;
  }
  return false;
}

module.exports = { handle };
