// grace · music · autoplay
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'autoplay',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['autoqueue'],
    description: 'Enable or disable autoplay',
    guard: { player: true, control: true },
    async run(ctx, _p, player) {
        player.autoplayEnabled = !player.autoplayEnabled;
        return ctx.status(`${E.autoplay} | autoplay ${player.autoplayEnabled ? 'enabled' : 'disabled'}.`);
    },
});
