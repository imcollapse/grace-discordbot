// grace · music · remove
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const E = require('../../../services/music/emojis');
const { formatDuration, safeTitle } = require('../../../services/music/helpers');

module.exports = command({
    name: 'remove',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['rm'],
    description: 'Remove a song from the queue',
    options: [{ name: 'position', type: 'integer', description: 'Position in the queue', required: true, min: 1 }],
    guard: { player: true, control: true },
    async run(ctx, { position }, player) {
        if (position > player.queue.length) return ctx.fail(`invalid position! Queue has **${player.queue.length}** tracks.`);
        const [removed] = player.queue.remove(position - 1);
        return ctx.status(`${E.trash} | removed **[${safeTitle(removed.info.title)}](${removed.info.uri})** from position ${position}.`);
    },
});
