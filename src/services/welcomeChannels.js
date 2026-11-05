// Premium — extra welcome channels. Each has its own message (text, {embed:name} or {container:name})
// and its own auto-delete. The main channel set up with `welcome` keeps working for everyone.

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const ui = require('./ui');
const P = require('./premium');
const V = require('./premium/views');
const greeter = require('./greeter');
const { GreetingChannel } = require('../database/schemas');

const MAX_AUTO = 3600;
const KIND = 'welcome';

const autoLabel = (s) => (!s ? 'kept' : s < 60 ? `${s}s` : s % 60 === 0 ? `${s / 60}m` : `${s}s`);
const clip = (s, n) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** "30", "30s", "5m" -> seconds, or null when it isn't a duration. */
function parseSeconds(token) {
    const m = String(token ?? '').match(/^(\d{1,4})(s|m)?$/i);
    if (!m) return null;
    return Math.min(MAX_AUTO, Number(m[1]) * (m[2]?.toLowerCase() === 'm' ? 60 : 1));
}

const rowsOf = (guildId) => GreetingChannel.findAll({ where: { guildId, kind: KIND }, order: [['createdAt', 'ASC']] });

/** Join event: post every extra channel's message (only while the server is premium). */
async function announce(member) {
    if (!(await P.isGuildPremium(member.guild.id))) return;
    for (const row of await rowsOf(member.guild.id)) {
        const res = await greeter.deliver(member.guild, row, member);
        if (!res.ok) console.error(`[welcome+] ${member.guild.id}/${row.channelId}: ${res.error}`);
    }
}

/* ── commands ──────────────────────────────────────────────────────── */

const isSlash = (c) => typeof c.isChatInputCommand === 'function' && c.isChatInputCommand();

function manageGate(ctx) {
    if (greeter.canManage(ctx.member)) return true;
    V.send(ctx, V.notice('bad', 'Manage Server needed', 'You need the **Manage Server** permission.'), { ephemeral: true });
    return false;
}

async function add(ctx, { channel, message, autoDelete = 0 }) {
    if (!manageGate(ctx)) return;
    if (!(await V.gate(ctx, 'Multiple welcome channels'))) return;

    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        return V.send(ctx, V.notice('warn', 'Pick a text channel', 'Usage: `welcome addchannel #channel [30s] <message>`'), { ephemeral: true });
    }
    message = String(message ?? '').trim();
    if (!message) return V.send(ctx, V.notice('warn', 'Write a message', 'It supports variables, `{embed:name}` and `{container:name}`.\nExample: `welcome addchannel #rules 30s Hi {user}, read the rules!`'), { ephemeral: true });
    if (message.length > greeter.MAX_MESSAGE) return V.send(ctx, V.notice('bad', 'Message too long', `Keep it under ${greeter.MAX_MESSAGE} characters.`), { ephemeral: true });

    const me = ctx.guild.members.me;
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        return V.send(ctx, V.notice('bad', 'I can\'t post there', `I need **View Channel** and **Send Messages** in <#${channel.id}>.`), { ephemeral: true });
    }

    const guildId = ctx.guild.id;
    const existing = await GreetingChannel.findOne({ where: { guildId, kind: KIND, channelId: channel.id } });
    const cap = P.perks.welcomeChannels.premium;
    if (!existing && (await GreetingChannel.count({ where: { guildId, kind: KIND } })) >= cap) {
        return V.send(ctx, V.notice('warn', `Limit reached (${cap})`, 'Remove one with `welcome removechannel #channel` first.'), { ephemeral: true });
    }
    autoDelete = Math.max(0, Math.min(MAX_AUTO, Number(autoDelete) || 0));
    if (existing) await existing.update({ message, autoDelete });
    else await GreetingChannel.create({ guildId, kind: KIND, channelId: channel.id, message, autoDelete });

    const box = V.notice('ok', existing ? 'Welcome channel updated' : 'Welcome channel added');
    box.addSeparatorComponents(ui.sep(false));
    box.addTextDisplayComponents(ui.text(
        `**Channel**  <#${channel.id}>\n**Auto-delete**  ${autoDelete ? autoLabel(autoDelete) : 'Off'}\n**Message**\n> ${clip(message, 300)}`));
    box.addTextDisplayComponents(ui.text(ui.sub('New members get this here in addition to your main welcome. See all with `welcome channels`.')));
    return V.send(ctx, box, { slashOnly: true });
}

async function remove(ctx, channel) {
    if (!manageGate(ctx)) return;
    if (!channel) return V.send(ctx, V.notice('warn', 'Which channel?', 'Usage: `welcome removechannel #channel`'), { ephemeral: true });
    const n = await GreetingChannel.destroy({ where: { guildId: ctx.guild.id, kind: KIND, channelId: channel.id } });
    return V.send(ctx, n ? V.notice('ok', 'Welcome channel removed', `<#${channel.id}> no longer gets a welcome message.`) : V.notice('warn', 'Not set up', `<#${channel.id}> isn't one of the extra welcome channels.`), { ephemeral: !n, slashOnly: true });
}

async function list(ctx) {
    if (!manageGate(ctx)) return;
    const guildId = ctx.guild.id;
    const [rows, main, status] = await Promise.all([rowsOf(guildId), greeter.read(guildId, KIND), P.guildStatus(guildId)]);
    const cap = P.perks.welcomeChannels.premium;

    const box = ui.box('base').setAccentColor(V.COLOR.sky)
        .addTextDisplayComponents(ui.text(`## Welcome channels\n-# ${rows.length}/${cap} extra  ·  ${status.active ? 'premium active' : 'premium needed'}`))
        .addSeparatorComponents(ui.sep(true, true))
        .addTextDisplayComponents(ui.text(`**Main**  ${main?.enabled && main.channelId ? `<#${main.channelId}>${main.autoDelete ? `  ·  auto-delete ${autoLabel(main.autoDelete)}` : ''}` : ui.sub('not set up, use `welcome`')}`));

    if (rows.length) {
        box.addSeparatorComponents(ui.sep());
        box.addTextDisplayComponents(ui.text('### Extra channels\n' + rows.map((r) =>
            `<#${r.channelId}>  ·  auto-delete ${r.autoDelete ? autoLabel(r.autoDelete) : 'off'}\n> ${clip(r.message, 110)}`).join('\n\n')));
    } else {
        box.addSeparatorComponents(ui.sep());
        box.addTextDisplayComponents(ui.text(ui.sub('No extra channels yet. Add one with `welcome addchannel #channel [30s] <message>`.')));
    }
    if (!status.active && rows.length) {
        box.addSeparatorComponents(ui.sep());
        box.addTextDisplayComponents(ui.text('!  Premium isn\'t active, so extra channels are **paused**. Nothing was deleted; they resume with premium.'));
    }
    if (!status.active) box.addActionRowComponents(V.links());
    return V.send(ctx, box, { slashOnly: true });
}

/** Prefix: `welcome addchannel #channel [30s] message…` */
function parsePrefix(message, args) {
    const channel = message.mentions.channels?.first?.()
        || (args[0] && message.guild.channels.cache.get(args[0].replace(/\D/g, '')));
    let rest = args.slice(1);
    let autoDelete = 0;
    const secs = parseSeconds(rest[0]);
    if (secs !== null && rest.length > 1) { autoDelete = secs; rest = rest.slice(1); }
    return { channel, autoDelete, message: rest.join(' ') };
}

module.exports = { announce, add, remove, list, parsePrefix, parseSeconds, isSlash, autoLabel };
