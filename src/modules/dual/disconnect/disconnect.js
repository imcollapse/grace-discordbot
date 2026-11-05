// grace · music · disconnect
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

const { hasControlPermission } = require('../../../services/music/helpers');
const { MSG } = require('../../../services/music/kit');
const stay = require('../../../services/music/stay');
const { stopCollectors } = require('../../../services/music/events');

// `leave` is already taken by the farewell / owner commands, so it is not an alias here
module.exports = command({
    name: 'disconnect',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['dc', 'dis'],
    description: 'Disconnect the bot from the voice channel',
    guard: {},
    async run(ctx) {
        const player = ctx.player;
        const botChannel = ctx.guild.members.me?.voice?.channel;
        const vc = ctx.member.voice.channel;
        if (!player && !botChannel) return ctx.fail("I'm not connected to any voice channel");
        if (vc.id !== (player?.voiceChannel || botChannel.id)) return ctx.fail(MSG.sameChannel);
        if (player && !hasControlPermission(ctx.src, player)) return ctx.fail(MSG.noControl);
        if (stay.isOn(ctx.guild.id)) {
            if (player) { player.queue.clear(); if (typeof player.stop === 'function') await player.stop(); stay.setStatus(ctx.client, ctx.guild.id, 'idle', player); }
            return ctx.status(`${E.stop} | 24/7 mode is on, so I'm staying in the voice channel. Use \`247 disable\` to let me leave.`);
        }
        if (player) { stopCollectors(player, 'disconnect'); player.destroy(); } else botChannel.guild.members.me.voice.disconnect();
        return ctx.status(`${E.stop} | disconnected from the voice channel.`);
    },
});
