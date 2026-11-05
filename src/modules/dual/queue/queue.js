// grace · music · queue
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

const { sendQueue } = require('../../../services/music/ui');

module.exports = command({
    name: 'queue',
    aliases: ['q'],
    description: 'Show the current song queue',
    guard: { player: true, same: false },
    async run(ctx, _p, player) {
        return sendQueue(ctx, player);
    },
});
