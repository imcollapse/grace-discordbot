// grace · music · clearqueue
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

// `clear` is already the alias of purge in grace, so the queue version is `clearqueue`
module.exports = command({
    name: 'clearqueue',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['cq', 'queueclear'],
    description: 'Clear the current queue',
    guard: { player: true, control: true },
    async run(ctx, _p, player) {
        if (!player.queue.length) return ctx.fail('the queue is already empty');
        player.queue.clear();
        return ctx.status(`${E.trash} | queue cleared.`);
    },
});
