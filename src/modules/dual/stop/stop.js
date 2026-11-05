// grace · music · stop
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const stay = require('../../../services/music/stay');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'stop',
    description: 'Stop the music and clear the queue',
    guard: { player: true, control: true },
    async run(ctx, _p, player) {
        player.queue.clear();
        if (stay.isOn(player.guildId)) {
            // 24/7: stop the music but stay in the channel
            if (typeof player.stop === 'function') await player.stop(); else player.skip();
            stay.setStatus(ctx.client, player.guildId, 'idle', player);
            return ctx.status(`${E.stop} | stopped music and cleared the queue. 24/7 is on, so I'm staying in the channel.`);
        }
        player.destroy();
        return ctx.status(`${E.stop} | stopped music and cleared the queue.`);
    },
});
