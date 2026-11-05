// grace · music · seek
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'seek',
    slash: false,   // prefix-only: frees a slash-command slot
    description: 'Seek to a specific time in the current song',
    options: [{ name: 'time', type: 'integer', description: 'Time to seek to, in seconds', required: true, min: 0 }],
    guard: { player: true, control: true },
    async run(ctx, { time }, player) {
        const track = player.currentTrack;
        if (!track) return ctx.fail('there is no track playing');
        if (track.info.isStream) return ctx.fail('you cannot seek in a live stream');
        const ms = time * 1000;
        if (ms >= track.info.length) return ctx.fail(`cannot seek beyond track duration! Track length: ${formatDuration(track.info.length)}`);
        await player.seekTo(ms);
        return ctx.status(`${E.seek} | seeked to **${formatDuration(ms)}**.`);
    },
});
