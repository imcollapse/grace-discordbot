// grace · music · pause
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'pause',
    description: 'Pause the current song',
    guard: { player: true },
    async run(ctx, _p, player) {
        player.pause(true);
        return ctx.status(`${E.pause} | music paused.`);
    },
});
