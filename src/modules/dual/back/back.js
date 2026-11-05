// grace · music · back
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

const { playPrevious } = require('../../../services/music/events');

module.exports = command({
    name: 'back',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['previous', 'prev'],
    description: 'Play the previous song',
    guard: { player: true, control: true },
    async run(ctx, _p, player) {
        const track = playPrevious(ctx.client, player);
        if (!track) return ctx.fail('no previous track in history');
        return ctx.status(`${E.previous} | playing previous track: **[${safeTitle(track.info.title)}](${track.info.uri})**`);
    },
});
