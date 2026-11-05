// grace — jailed: who is in jail right now (paged)

const { MessageFlags } = require('discord.js');
const ui = require('../../services/ui');
const J = require('../../services/jail');

const V2 = MessageFlags.IsComponentsV2;
const PER_PAGE = 6;

function page(rows, p, disabled = false) {
    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    p = Math.min(Math.max(0, p), pages - 1);
    const b = ui.box('base').setAccentColor(J.COLOR.warn)
        .addTextDisplayComponents(ui.text(`### Jailed members\n-# ${rows.length} in jail  ·  page ${p + 1}/${pages}`))
        .addSeparatorComponents(ui.sep(true, true));
    rows.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE).forEach((r, i, arr) => {
        b.addTextDisplayComponents(ui.text([
            `**<@${r.userId}>**  ·  \`${r.userId}\``,
            `**By** <@${r.moderatorId}>  ·  **Since** ${J.ts(r.jailedAt)}`,
            `**Release** ${r.expiresAt ? J.ts(r.expiresAt) : 'manual'}${r.reason ? `\n**Reason** ${String(r.reason).slice(0, 120)}` : ''}`,
        ].join('\n')));
        if (i < arr.length - 1) b.addSeparatorComponents(ui.sep(false));
    });
    if (pages > 1) b.addActionRowComponents(ui.row(
        ui.btn('jailed_prev', 'Previous', { disabled: disabled || p === 0 }),
        ui.btn('jailed_next', 'Next', { disabled: disabled || p === pages - 1 }),
    ));
    return { box: b, p };
}

module.exports = {
    name: 'jailed',
    description: 'See who is in jail',
    aliases: [],
    usage: 'jailed',
    category: 'moderation',

    async execute(message) {
        const { guild } = message;
        if (!guild) return;
        const reply = (c) => message.reply({ components: [c], flags: V2, allowedMentions: { parse: [] } });

        if (!(await J.config(guild.id))) return reply(J.fail('Jail isn\'t set up yet.', 'Run `jail setup` first.'));
        const rows = await J.listJailed(guild.id);
        if (!rows.length) return reply(J.ok('Nobody is in jail.'));

        let cur = page(rows, 0);
        const sent = await reply(cur.box);
        if (rows.length <= PER_PAGE) return;

        const col = sent.createMessageComponentCollector({ filter: ui.onlyUser(message.author.id), time: 120000 });
        col.on('collect', async (i) => {
            try {
                await i.deferUpdate();
                cur = page(rows, cur.p + (i.customId === 'jailed_next' ? 1 : -1));
                await i.editReply({ components: [cur.box], flags: V2 });
                col.resetTimer();
            } catch (e) { console.error('[jailed]', e.message); }
        });
        col.on('end', () => sent.edit({ components: [page(rows, cur.p, true).box], flags: V2 }).catch(() => {}));
    },
};
