// grace · music · forward
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'forward',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['fwd', 'ff'],
    description: 'Skip forward in the current song',
    options: [{ name: 'seconds', type: 'integer', description: 'Number of seconds to skip forward', required: true, min: 1 }],
    guard: { player: true, control: true },
    async run(ctx, { seconds }, player) {
        const track = player.currentTrack;
        if (!track) return ctx.fail('there is no track playing');
        if (track.info.isStream) return ctx.fail('you cannot seek in a live stream');
        const target = (player.position || 0) + seconds * 1000;
        if (target >= track.info.length) return ctx.fail(`cannot seek beyond track duration! Track length: ${formatDuration(track.info.length)}`);
        await player.seekTo(target);
        return ctx.status(`${E.seek} | skipped forward **${seconds}s** to **${formatDuration(target)}**.`);
    },
});
