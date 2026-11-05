// grace · music · lyrics

const { command } = require('../../../services/music/kit');
const { findLyrics } = require('../../../services/music/lyrics');
const ui = require('../../../services/music/ui');
const E = require('../../../services/music/emojis');
const { ContainerBuilder } = require('discord.js');

module.exports = command({
    name: 'lyrics',
    aliases: ['ly'],
    description: 'Show the lyrics of the currently playing song',
    guard: { player: true, same: false },
    async run(ctx, _p, player) {
        const track = player.currentTrack;
        if (!track) return ctx.fail('no track is currently playing');
        await ctx.loading('looking for lyrics…');

        const found = await findLyrics(track);
        if (!found?.lyrics) return ctx.respond(ui.fail('could not find lyrics for this song.'));

        const body = found.lyrics.length > 3900 ? `${found.lyrics.slice(0, 3897)}...` : found.lyrics;
        const container = new ContainerBuilder().setAccentColor(ui.WHITE)
            .addTextDisplayComponents(ui.text(`## ${E.lyrics} ${found.artist} - ${found.title}`))
            .addTextDisplayComponents(ui.text(`[Open track](${track.info.uri})`))
            .addSeparatorComponents(ui.divider())
            .addTextDisplayComponents(ui.text(body))
            .addSeparatorComponents(ui.divider())
            .addTextDisplayComponents(ui.text(`-# source: ${found.source}`));
        return ctx.respond({ components: [container], flags: ui.V2_FLAGS, allowedMentions: ui.NO_PINGS });
    },
});
