// grace · music · skip
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'skip',
    aliases: ['next', 'sk'],
    description: 'Skip the current song',
    guard: { player: true, control: true },
    async run(ctx, _p, player) {
        if (!player.currentTrack) return ctx.fail('there is no track to skip');
        player.skip();
        return ctx.status(`${E.skip} | skipped the current track.`);
    },
});
