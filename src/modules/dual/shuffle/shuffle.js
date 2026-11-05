// grace · music · shuffle
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'shuffle',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['mix'],
    description: 'Shuffle the queue order',
    guard: { player: true, control: true },
    async run(ctx, _p, player) {
        if (player.queue.length < 2) return ctx.fail('not enough tracks in the queue to shuffle');
        player.queue.shuffle();
        return ctx.status(`${E.shuffle} | queue shuffled.`);
    },
});
