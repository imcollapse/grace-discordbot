// grace · music · loop
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

const MODES = [
    { name: 'Off', value: 'none' },
    { name: 'Track', value: 'track' },
    { name: 'Queue', value: 'queue' },
];

module.exports = command({
    name: 'loop',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['repeat'],
    description: 'Set the repeat mode (off, track or queue)',
    options: [{ name: 'mode', type: 'string', description: 'Repeat mode, leave empty to cycle', choices: MODES }],
    guard: { player: true, control: true },
    async run(ctx, { mode }, player) {
        if (!mode) mode = { NONE: 'track', TRACK: 'queue', QUEUE: 'none' }[player.loop] || 'track';
        if (mode === 'none') { player.setLoop('NONE'); return ctx.status(`${E.loop} | loop mode disabled.`); }
        if (mode === 'track') { player.setLoop('TRACK'); return ctx.status(`${E.loop} | loop track enabled.`); }
        player.setLoop('QUEUE');
        return ctx.status(`${E.loop} | queue repeat enabled.`);
    },
});
