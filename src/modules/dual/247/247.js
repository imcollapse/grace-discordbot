// grace · music · 24/7
//   247 enable     stay in your current voice channel around the clock   (Manage Server)
//   247 disable    let the bot leave again                               (Manage Server)
//   247 status     show the current setting
// Prefix-only (slash: false): the bot is at Discord's limit of 100 slash commands.

const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, PermissionFlagsBits } = require('discord.js');
const { command } = require('../../../services/music/kit');
const ui = require('../../../services/music/ui');
const stay = require('../../../services/music/stay');

const ON = ['enable', 'on', 'set', 'start'];
const OFF = ['disable', 'off', 'stop', 'remove'];

const card = (title, lines) => ({
    components: [new ContainerBuilder().setAccentColor(ui.WHITE)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))],
    flags: ui.V2_FLAGS,
    allowedMentions: ui.NO_PINGS,
});

module.exports = command({
    name: '247',
    aliases: ['24/7', 'stay', 'twentyfourseven'],
    description: 'Keep the bot in a voice channel 24/7',
    slash: false,
    guard: { voice: false },
    async run(ctx) {
        const word = (ctx.args[0] || 'status').toLowerCase();
        const cfg = stay.get(ctx.guild.id);

        if (word === 'status' || word === 'info') {
            const ch = cfg && ctx.guild.channels.cache.get(cfg.voiceChannelId);
            return ctx.respond(card('24/7 mode', cfg
                ? [`**State**  On`, `**Channel**  ${ch ? `<#${ch.id}>` : '`deleted channel`'}`, '', `-# Turn it off with \`${ctx.prefix}247 disable\``]
                : ['**State**  Off', '', `-# Join a voice channel and run \`${ctx.prefix}247 enable\``]));
        }

        const m = ctx.member;
        if (!m.permissions.has(PermissionFlagsBits.ManageGuild) && !m.permissions.has(PermissionFlagsBits.Administrator)) {
            return ctx.fail('you need the **Manage Server** permission to change 24/7 mode');
        }

        if (OFF.includes(word)) {
            if (!cfg) return ctx.fail('24/7 mode is already off');
            const player = ctx.player;
            await stay.disable(ctx.guild.id);            // first, so the player leaving isn't treated as a drop
            if (player) { player.queue.clear(); player.destroy(); }
            else await stay.clearStatus(ctx.client, cfg.voiceChannelId);
            return ctx.respond(card('24/7 mode off', ['I will leave the voice channel and go back to leaving when it\'s empty.']));
        }

        if (ON.includes(word)) {
            const vc = m.voice?.channel;
            if (!vc) return ctx.fail('join the voice channel you want me to stay in first');
            if (!ctx.poru) return ctx.fail('music is not set up on this bot yet (no lavalink node configured)');
            const perms = vc.permissionsFor(ctx.guild.members.me);
            if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
                return ctx.fail(`i need **view channel**, **connect** and **speak** in ${vc}`);
            }
            const current = ctx.player;
            if (current && current.voiceChannel !== vc.id && current.currentTrack) return ctx.fail('i\'m playing in another voice channel, join that one or stop the music first');

            await stay.enable(ctx.guild.id, vc.id, ctx.channel.id, ctx.user.id);
            await stay.join(ctx.client, ctx.guild.id);
            return ctx.respond(card('24/7 mode on', [
                `I'll stay in ${vc} around the clock, even when it's empty, and come back after restarts.`,
                '', `-# \`${ctx.prefix}stop\` stops the music but keeps me here  ·  \`${ctx.prefix}247 disable\` lets me leave`,
            ]));
        }
        return ctx.fail(`usage: \`${ctx.prefix}247 <enable | disable | status>\``);
    },
});
