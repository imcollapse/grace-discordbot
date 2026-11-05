// grace · feedback buttons, selects and forms. Logic lives in services/feedback.js.
//   fb_rate_1…5 · open_feedback_modal      open the review form
//   fb_modal_N · feedback_modal             the form was sent
//   feedback_setup_*                        the setup screen

const { MessageFlags } = require('discord.js');
const F = require('../../services/feedback');
const ui = require('../../services/ui');
const db = require('../../database/feedback');

const V2 = MessageFlags.IsComponentsV2;
const NO = { parse: [] };

async function handle(interaction) {
  const id = interaction.customId;
  if (!id) return false;

  try {
    if (interaction.isButton()) {
      if (id === 'open_feedback_modal') { await interaction.showModal(F.modal(null)); return true; }
      const star = id.match(/^fb_rate_([1-5])$/);
      if (star) { await interaction.showModal(F.modal(Number(star[1]))); return true; }

      if (id === 'feedback_setup_save' || id === 'feedback_setup_panel') {
        if (!F.isAdmin(interaction)) { await interaction.reply({ components: [ui.fail('Only administrators can do that.')], flags: V2 | MessageFlags.Ephemeral }); return true; }
        const s = F.sessions.get(interaction.user.id);
        if (!s?.review) { await interaction.update({ components: [ui.notice('warning', 'This setup expired. Run the feedback setup again.')], flags: V2 }); return true; }
        await db.setConfig(interaction.guildId, s.review, s.log ?? null, s.role ?? null);
        F.sessions.delete(interaction.user.id);
        let c = ui.notice('success', `Saved. Reviews go to <#${s.review}>${s.log ? `, logs to <#${s.log}>` : ''}${s.role ? `, and <@&${s.role}> is pinged` : ''}.`, { footer: id === 'feedback_setup_panel' ? null : 'Use the panel command to post the review panel' });
        if (id === 'feedback_setup_panel') {
          try { const { channel, msg } = await F.sendPanel(interaction.guild); c = ui.notice('success', `Saved, and the panel is live in ${channel}.`); c.addActionRowComponents(ui.row(ui.link('Jump to panel', msg.url))); }
          catch (e) { c = ui.notice('warning', `Saved, but the panel was not sent: ${e.message}`); }
        }
        await interaction.update({ components: [c], flags: V2, allowedMentions: NO });
        return true;
      }
      return false;
    }

    if (interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu?.()) {
      if (!id.startsWith('feedback_setup_')) return false;
      if (!F.isAdmin(interaction)) { await interaction.reply({ components: [ui.fail('Only administrators can do that.')], flags: V2 | MessageFlags.Ephemeral }); return true; }
      const s = F.sessions.get(interaction.user.id) ?? { review: null, log: null, role: null };
      const pick = (interaction.channels ?? interaction.roles)?.first?.()?.id ?? null;
      if (id === 'feedback_setup_review') s.review = pick;
      else if (id === 'feedback_setup_log') s.log = pick;
      else if (id === 'feedback_setup_role') s.role = pick;
      else return false;
      F.sessions.set(interaction.user.id, s);
      await interaction.update({ components: [F.setupCard(s, true)], flags: V2, allowedMentions: NO });
      return true;
    }

    if (interaction.isModalSubmit()) {
      if (id === 'feedback_modal') { await F.submit(interaction, null); return true; }
      const m = id.match(/^fb_modal_([1-5])$/);
      if (m) { await F.submit(interaction, Number(m[1])); return true; }
    }
  } catch (e) {
    console.error('[feedback]', e);
    const payload = { components: [ui.fail('Something went wrong. Please try again.')], flags: V2 | MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
    return true;
  }
  return false;
}

module.exports = { handle };
