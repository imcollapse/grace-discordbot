// grace · music · volume
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'volume',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['vol', 'v'],
    description: 'Set the music volume',
    options: [{ name: 'level', type: 'integer', description: 'Volume level (1-100)', required: true, min: 1, max: 100 }],
    guard: { player: true, control: true },
    async run(ctx, { level }, player) {
        await player.setVolume(level);
        return ctx.status(`${E.volume} | volume set to **${level}**.`);
    },
});
