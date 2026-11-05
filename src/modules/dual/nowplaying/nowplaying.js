// grace · music · nowplaying
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

const { AttachmentBuilder } = require('discord.js');
const { musicCard } = require('../../../services/music/card');
const ui = require('../../../services/music/ui');

module.exports = command({
    name: 'nowplaying',
    aliases: ['np'],
    description: 'Show the currently playing song',
    guard: { player: true, same: false },
    async run(ctx, _p, player) {
        const track = player.currentTrack;
        if (!track) return ctx.fail('no music is currently playing');
        if (ctx.isSlash) await ctx.src.deferReply();
        const buffer = await musicCard.generateNowPlayingCard({ track, position: player.position || 0, player });
        const file = new AttachmentBuilder(buffer, { name: 'nowplaying.png' });
        return ctx.respond({ files: [file], allowedMentions: ui.NO_PINGS });
    },
});
