// grace · music · backward
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'backward',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['bwd', 'rewind', 'rw'],
    description: 'Skip backward in the current song',
    options: [{ name: 'seconds', type: 'integer', description: 'Number of seconds to skip backward', required: true, min: 1 }],
    guard: { player: true, control: true },
    async run(ctx, { seconds }, player) {
        const track = player.currentTrack;
        if (!track) return ctx.fail('there is no track playing');
        if (track.info.isStream) return ctx.fail('you cannot seek in a live stream');
        const target = Math.max(0, (player.position || 0) - seconds * 1000);
        await player.seekTo(target);
        return ctx.status(`${E.rewind} | skipped backward **${seconds}s** to **${formatDuration(target)}**.`);
    },
});
