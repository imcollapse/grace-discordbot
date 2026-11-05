// grace · the `level setup` panel and the level-up embed editor.
//   panel()    the container: status, where to announce, message style (Normal Message / Embed / Container)
//   editor()   a live-preview embed with buttons that open modals for every part of it
// Component ids are `lvl:<action>`; events/interactions/levelHandler.js answers them.

const {
    SectionBuilder, ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, MessageFlags,
} = require('discord.js');
const kit = require('./ui');
const emojis = require('../media/emojis.json');
const L = require('./levels');
const db = require('../database/levels');
const { Container } = require('../database/schemas');
const { renderEmbed, MAX_FIELDS } = require('./embedRender');
const { variableGroups } = require('./embedVars');

const V2 = MessageFlags.IsComponentsV2;
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

const MODES = {
    same:    ['Where they chatted',  'Posts in the channel the level-up happened in'],
    channel: ['A set channel',       'Always posts in the channel picked above'],
    dm:      ['Direct message',      'Sends it to the member privately'],
    off:     ['Nowhere',             'No announcements, roles are still given'],
};
const STYLES = { default: 'Built-in embed', text: 'Normal message', embed: 'Custom embed', container: 'Container' };

/* ---------- main panel ---------- */

async function panel(guild, cfg, rewards, { note = '' } = {}) {
    const containers = (await Container.findAll({ where: { guildId: guild.id }, attributes: ['name'], order: [['name', 'ASC']] }).catch(() => [])).map((r) => r.name);

    const toggle = kit.btn('lvl:toggle', cfg.enabled ? 'Disable' : 'Enable', { style: cfg.enabled ? 'danger' : 'success' });
    const head = new SectionBuilder()
        .addTextDisplayComponents(kit.text('### Levels\n-# Members earn XP by chatting, climb levels and unlock roles'))
        .setButtonAccessory(toggle);

    const where = cfg.mode === 'channel' ? (cfg.channel_id ? `<#${cfg.channel_id}>` : '`pick a channel`') : MODES[cfg.mode][0];
    const styleLine = cfg.style === 'container' ? `Container ${cfg.container ? `\`${cfg.container}\`` : '**none picked**'}` : STYLES[cfg.style];
    const info = [
        `**Status**  ${cfg.enabled ? `${emojis.toggle_on} On` : `${emojis.toggle_off} Off`}`,
        `**Announce**  ${cfg.mode === 'off' ? 'Off' : where}${cfg.auto_delete ? ` · deleted after ${cfg.auto_delete}s` : ''}`,
        `**Message**  ${styleLine}`,
        `**XP**  ${cfg.xp_min}–${cfg.xp_max} per message · every ${cfg.cooldown}s`,
        `**Voice XP**  ${cfg.voice ? 'On' : 'Off'}  ·  **Roles**  ${cfg.stack ? 'keep all' : 'only the highest'}  ·  **Rewards**  ${rewards.length}`,
    ].join('\n');

    const card = kit.box().addSectionComponents(head).addSeparatorComponents(kit.sep());
    if (note) card.addTextDisplayComponents(kit.text(note));
    card.addTextDisplayComponents(kit.text(info)).addSeparatorComponents(kit.sep(false));
    card.addTextDisplayComponents(kit.text(kit.sub('Pick a channel below, then choose a message style. Rank cards use each member\'s profile colour.')));

    const channelSel = new ChannelSelectMenuBuilder().setCustomId('lvl:channel').setPlaceholder('Search for a channel…')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
    if (cfg.channel_id) channelSel.setDefaultChannels(cfg.channel_id);

    const styleBtn = (id, label) => kit.btn(`lvl:style:${id}`, label, { style: cfg.style === id ? 'primary' : 'secondary' });
    const controls = kit.box()
        .addActionRowComponents(new ActionRowBuilder().addComponents(channelSel))
        .addActionRowComponents(kit.row(kit.select('lvl:mode', `Announce: ${MODES[cfg.mode][0].toLowerCase()}`,
            Object.entries(MODES).map(([v, [label, description]]) => ({ label, value: v, description, default: v === cfg.mode })))))
        .addActionRowComponents(kit.row(styleBtn('default', 'Default'), styleBtn('text', 'Normal Message'), styleBtn('embed', 'Embed'), styleBtn('container', 'Container')));

    if (cfg.style === 'container') {
        controls.addActionRowComponents(kit.row(kit.select('lvl:ctr', containers.length ? 'Pick a saved container…' : 'No containers yet. Make one with /container create',
            containers.length ? containers.slice(0, 25).map((n) => ({ label: n, value: n, default: n === cfg.container })) : [{ label: 'none', value: 'none' }], { disabled: !containers.length })));
    }
    controls.addActionRowComponents(kit.row(
        kit.btn('lvl:settings', 'XP & timing'),
        kit.btn('lvl:voice', `Voice XP: ${cfg.voice ? 'on' : 'off'}`),
        kit.btn('lvl:stack', cfg.stack ? 'Roles: keep all' : 'Roles: highest only'),
        kit.btn('lvl:prev', 'Preview'),
        kit.btn('lvl:vars', 'Variables'),
    ));
    return [card, controls];
}

/* ---------- variables ---------- */

function variablesCard() {
    const lv = L.VARIABLES.map(([t, d]) => `\`${t}\`  ${d}`).join('\n');
    const more = variableGroups().filter((g) => g.title === 'User' || g.title === 'Server')
        .map((g) => `**${g.title}**  ${g.items.slice(0, 7).map((i) => `\`${i.tag}\``).join(' ')}`).join('\n');
    return [kit.box()
        .addTextDisplayComponents(kit.text('### Variables\n-# Work in the message, the embed and containers'))
        .addSeparatorComponents(kit.sep())
        .addTextDisplayComponents(kit.text(`**Level-up**\n${lv}`))
        .addSeparatorComponents(kit.sep(false))
        .addTextDisplayComponents(kit.text(`${more}\n\n${kit.sub('Every user and server variable works too, like {user.nick} or {server.members}. Image fields accept one variable, such as {user.avatar}.')}`))];
}

/* ---------- preview ---------- */

/** What a level-up looks like for this member, with made-up numbers. */
async function sample(member, channel, rewards) {
    const level = 6, xp = L.total(level) + Math.round(L.need(level) * 0.12);
    const at = rewards.find((r) => r.level === level) ?? rewards[0];
    const role = at ? member.guild.roles.cache.get(at.role_id) : null;
    return L.contextFor(member, channel, { level, oldLevel: level - 1, xp, rank: 3, messages: 420, reward: role });
}

/* ---------- embed editor ---------- */

const eb = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

async function editor(member, channel, cfg, rewards, note = '') {
    const d = { ...L.DEFAULT_EMBED, ...(cfg.embed ?? {}) };
    const ctx = await sample(member, channel, rewards);
    const payload = renderEmbed({ id: 'level', data: d }, ctx, { preview: true });
    const nF = d.fields?.length ?? 0;
    const mark = (ok) => (ok ? '✓' : '○');
    const chips = [
        `${mark(d.title || d.description)} Text`, `${mark(d.author?.name)} Author`, `${mark(d.footer?.text)} Footer`,
        `${mark(d.image || d.thumbnail)} Images`, `${mark(nF)} Fields${nF ? ` ${nF}` : ''}`, `${mark(d.timestamp)} Timestamp`,
    ].join('   ');

    const rows = [
        new ActionRowBuilder().addComponents(
            eb('lvl:e_text', 'Edit Embed', ButtonStyle.Primary), eb('lvl:e_meta', 'Author & Footer'),
            eb('lvl:e_field', 'Add Field'), eb('lvl:e_msg', 'Message'), eb('lvl:e_vars', 'Variables')),
        new ActionRowBuilder().addComponents(
            eb('lvl:e_ts', d.timestamp ? 'Timestamp: on' : 'Timestamp: off'), eb('lvl:e_test', 'Test'),
            eb('lvl:e_reset', 'Reset', ButtonStyle.Danger), eb('lvl:e_done', 'Done', ButtonStyle.Success)),
    ];
    if (nF) {
        rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('lvl:e_rmfield').setPlaceholder('Remove a field…')
            .addOptions(d.fields.slice(0, MAX_FIELDS).map((f, i) => ({ label: cut(`${i + 1}. ${f.name || '(blank)'}`, 100), value: String(i) })))));
    }

    return {
        content: [
            '### Level-up embed',
            `-# Saved automatically · live preview below, with sample numbers · {variables} work everywhere`,
            chips, cfg.message ? `**Message above it:** ${cut(cfg.message, 120)}` : '', note ? `\n${note}` : '',
        ].filter(Boolean).join('\n'),
        embeds: payload.embeds,
        components: rows,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
    };
}

module.exports = { V2, MODES, STYLES, panel, variablesCard, editor, sample };
