// grace — updates: release notes for every version (slash and prefix).
//   updates [version]      e.g. `updates 1.4.0`   ·   /updates version:1.4.0

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ui = require('../../../services/ui');
const config = require('../../../settings');
const emojis = require('../../../media/emojis.json');
const releases = require('../../../data/changelog');

const V2 = MessageFlags.IsComponentsV2;
const SECTIONS = [
    ['added', 'Added', emojis.toggle_on],
    ['changed', 'Changed', emojis.info],
    ['fixed', 'Fixed', emojis.success],
    ['removed', 'Removed', emojis.error],
];
const ts = (date) => `<t:${Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000)}:D>`;
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function find(query) {
    const q = String(query || '').toLowerCase().replace(/^v/, '').trim();
    if (!q) return 0;
    const i = releases.findIndex((r) => r.version === q || r.title.toLowerCase().includes(q));
    return i;
}

function view(index, id, disabled = false) {
    const r = releases[index];
    const current = index === 0;
    const b = ui.box('base')
        .addTextDisplayComponents(ui.text(`## ${config.BOT_NAME} v${r.version} — ${r.title}\n-# Released ${ts(r.date)}${current ? '  ·  You\'re on this version' : ''}`))
        .addSeparatorComponents(ui.sep(true, true));

    for (const [key, label, icon] of SECTIONS) {
        if (!r[key]?.length) continue;
        b.addTextDisplayComponents(ui.text(`### ${icon ? `${icon} ` : ''}${label}\n${r[key].map((t) => `• ${t}`).join('\n')}`));
    }

    b.addSeparatorComponents(ui.sep(true))
        .addTextDisplayComponents(ui.text(ui.sub(`Full version \`v${r.version}\` build.${r.build}`)))
        .addActionRowComponents(ui.row(ui.select(`${id}:pick`, `v${r.version} — ${r.title}`.slice(0, 100),
            releases.slice(0, 25).map((x, i) => ({ label: clip(`v${x.version} — ${x.title}`, 100), value: String(i), description: `Build ${x.build} · Released ${x.date}`, default: i === index })), { disabled })))
        .addActionRowComponents(ui.row(
            ui.btn(`${id}:older`, 'Older', { emoji: emojis.arrow_left, disabled: disabled || index >= releases.length - 1 }),
            ui.btn(`${id}:newer`, 'Newer', { emoji: emojis.arrow_right, disabled: disabled || index <= 0 }),
            ui.link('Support', config.SUPPORT_SERVER),
        ));
    return b;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('updates')
        .setDescription('See what is new: release notes for every version')
        .addStringOption((o) => o.setName('version').setDescription('A version, e.g. 1.4.0 (default: the latest)')),

    name: 'updates',
    description: 'Release notes for every version',
    aliases: ['whatsnew', 'versions', 'releases'],
    category: 'info',
    usage: 'updates [version]',

    async execute(ctx, args = []) {
        const slash = !!ctx.isChatInputCommand?.();
        const user = slash ? ctx.user : ctx.author;
        const query = slash ? ctx.options.getString('version') : args[0];
        let index = find(query);
        if (index < 0) {
            const box = ui.box('error').addTextDisplayComponents(ui.text(`${emojis.error}  No version matches \`${String(query).slice(0, 30)}\`.`));
            return slash ? ctx.reply({ components: [box], flags: V2 | MessageFlags.Ephemeral }) : ctx.reply({ components: [box], flags: V2 });
        }

        const id = `upd_${Date.now().toString(36)}${user.id.slice(-3)}`;
        const payload = (i, off) => ({ components: [view(i, id, off)], flags: V2, allowedMentions: { parse: [] } });
        let sent;
        if (slash) sent = (await ctx.reply({ ...payload(index), withResponse: true }))?.resource?.message ?? await ctx.fetchReply();
        else sent = await ctx.reply(payload(index));

        const col = sent.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: 180000 });
        col.on('collect', async (i) => {
            try {
                if (i.customId === `${id}:pick`) index = Number(i.values[0]);
                else if (i.customId === `${id}:older`) index = Math.min(releases.length - 1, index + 1);
                else if (i.customId === `${id}:newer`) index = Math.max(0, index - 1);
                else return;
                await i.update(payload(index));
                col.resetTimer();
            } catch (e) { console.error('[updates]', e.message); }
        });
        col.on('end', () => (slash ? ctx.editReply(payload(index, true)) : sent.edit(payload(index, true))).catch(() => {}));
        return sent;
    },
};
