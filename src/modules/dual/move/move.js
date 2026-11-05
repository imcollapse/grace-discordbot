// grace · music · move
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'move',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['mv'],
    description: 'Move a track to a different position in the queue',
    options: [
        { name: 'from', type: 'integer', description: 'Current position of the track', required: true, min: 1 },
        { name: 'to', type: 'integer', description: 'New position for the track', required: true, min: 1 },
    ],
    guard: { player: true, control: true },
    async run(ctx, { from, to }, player) {
        const len = player.queue.length;
        if (!len) return ctx.fail('the queue is empty');
        if (from > len || to > len) return ctx.fail(`invalid position! Queue has **${len}** tracks.`);
        if (from === to) return ctx.fail('source and destination positions are the same');
        const [track] = player.queue.splice(from - 1, 1);
        player.queue.splice(to - 1, 0, track);
        return ctx.status(`${E.move} | moved **[${safeTitle(track.info.title)}](${track.info.uri})** from position ${from} to ${to}.`);
    },
});
