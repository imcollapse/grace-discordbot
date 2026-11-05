// grace — honeypot
//   honeypot setup              create a #honeypot channel and arm it
//   honeypot add #channel       arm an existing channel
//   honeypot remove             disarm (the channel stays)
//   honeypot action <ban|softban|kick|timeout>
//   honeypot log [#channel|off] log every catch
//   honeypot status

const { PermissionFlagsBits: P, ChannelType, MessageFlags } = require('discord.js');
const ui = require('../../services/ui');
const H = require('../../services/honeypot');

const V2 = MessageFlags.IsComponentsV2;
const send = (message, c) => message.reply({ components: [c], flags: V2, allowedMentions: { parse: [] } });
const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const channelFrom = (message, token) => message.mentions.channels?.first?.() || message.guild.channels.cache.get(String(token || '').replace(/\D/g, ''));

module.exports = {
    name: 'honeypot',
    description: 'A trap channel: anyone who posts there is punished automatically',
    aliases: ['hp'],
    usage: 'honeypot setup | add #channel | remove | action <ban|softban|kick|timeout> | log [#channel|off] | status',
    category: 'moderation',

    async execute(message, args = []) {
        const { guild, member } = message;
        if (!guild) return;
        if (!member.permissions.has(P.Administrator) && !member.permissions.has(P.ManageGuild)) {
            return send(message, H.fail('You need the **Manage Server** permission.'));
        }
        const sub = (args[0] || 'status').toLowerCase();
        const cfg = await H.config(guild.id);

        switch (sub) {
            case 'setup': case 'create': return setup(message, cfg);
            case 'add': case 'set': return add(message, cfg, args[1]);
            case 'remove': case 'off': case 'disable': return remove(message, cfg);
            case 'action': return action(message, cfg, args[1]);
            case 'log': return log(message, cfg, args[1]);
            case 'status': case 'info': return status(message, cfg);
            default: return send(message, H.fail('Use `honeypot setup`, `add`, `remove`, `action`, `log` or `status`.'));
        }
    },
};

const notSetUp = (message) => send(message, H.warn('No honeypot is configured. Run `honeypot setup` to create one.'));

async function setup(message, cfg) {
    const { guild } = message;
    if (cfg) return send(message, H.warn(`A honeypot is already armed in <#${cfg.channelId}>.`));
    const lacking = H.missing(guild, 'ban').concat(guild.members.me.permissions.has(P.ManageChannels) ? [] : ['Manage Channels']);
    if (lacking.length) return send(message, H.fail(`I need **${lacking.join('**, **')}**.`));

    let channel;
    try {
        channel = await guild.channels.create({
            name: 'honeypot', type: ChannelType.GuildText, topic: 'Do not send messages here.',
            permissionOverwrites: [{ id: guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.ManageMessages, P.EmbedLinks] }],
            reason: 'Honeypot setup',
        });
    } catch (e) { return send(message, H.fail('I couldn\'t create the channel.')); }

    const armed = await H.arm(guild, channel);
    return send(message, H.ok(`Honeypot armed in <#${channel.id}>. Anyone who posts there will be **${H.ACTIONS[armed.action]}**.\nChange this with \`honeypot action\` (ban | softban | kick | timeout).`));
}

async function add(message, cfg, token) {
    const { guild } = message;
    const channel = channelFrom(message, token);
    if (!channel || !TEXT.includes(channel.type)) return send(message, H.fail('Mention a text channel: `honeypot add #channel`.'));
    const lacking = H.missing(guild, cfg?.action || 'ban');
    if (lacking.length) return send(message, H.fail(`I need **${lacking.join('**, **')}**.`));
    if (!channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages])) return send(message, H.fail(`I can't post in <#${channel.id}>.`));

    if (cfg) await H.disarm(guild);           // moving the trap: the old warning goes
    const armed = await H.arm(guild, channel, cfg?.action || 'ban', cfg?.logId || null);
    return send(message, H.ok(`Honeypot armed in <#${channel.id}>. Anyone who posts there will be **${H.ACTIONS[armed.action]}**.`));
}

async function remove(message, cfg) {
    if (!cfg) return notSetUp(message);
    await H.disarm(message.guild);
    return send(message, H.ok('Honeypot removed.'));
}

async function action(message, cfg, word) {
    if (!cfg) return notSetUp(message);
    const a = String(word || '').toLowerCase();
    if (!Object.keys(H.ACTIONS).includes(a)) return send(message, H.fail('Pick one: `ban`, `softban`, `kick` or `timeout`.'));
    const lacking = H.missing(message.guild, a);
    if (lacking.length) return send(message, H.fail(`I need **${lacking.join('**, **')}** for that.`));
    await H.save(message.guild.id, { action: a });
    await H.refreshWarning(message.guild, { ...cfg, action: a });
    return send(message, H.ok(`Anyone who posts in <#${cfg.channelId}> will now be **${H.ACTIONS[a]}**.`));
}

async function log(message, cfg, token) {
    if (!cfg) return notSetUp(message);
    if (!token) return send(message, H.ok(cfg.logId ? `Catches are logged in <#${cfg.logId}>.` : 'No log channel set. Use `honeypot log #channel`.'));
    if (['off', 'none', 'remove'].includes(token.toLowerCase())) { await H.save(message.guild.id, { logId: null }); return send(message, H.ok('Logging turned off.')); }
    const channel = channelFrom(message, token);
    if (!channel || !TEXT.includes(channel.type)) return send(message, H.fail('Mention a text channel.'));
    await H.save(message.guild.id, { logId: channel.id });
    return send(message, H.ok(`Catches will be logged in <#${channel.id}>.`));
}

async function status(message, cfg) {
    if (!cfg) return notSetUp(message);
    const exists = message.guild.channels.cache.has(cfg.channelId);
    return send(message, ui.box('base').setAccentColor(ui.COLOR.base)
        .addTextDisplayComponents(ui.text('### Honeypot'))
        .addSeparatorComponents(ui.sep(true))
        .addTextDisplayComponents(ui.text([
            `**Channel**  ${exists ? `<#${cfg.channelId}>` : `${H.CROSS} deleted`}`,
            `**Action**  ${H.ACTIONS[cfg.action]}`,
            `**Caught**  ${cfg.caught}`,
            `**Log**  ${cfg.logId ? `<#${cfg.logId}>` : 'off'}`,
        ].join('\n'))));
}
