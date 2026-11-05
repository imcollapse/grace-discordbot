// grace · music · play
// ported from AeroX Music (AeroX Development), rebuilt on grace's hybrid command kit

const { command } = require('../../../services/music/kit');
const { ensurePlayer, enqueue } = require('../../../services/music/session');
const ui = require('../../../services/music/ui');
const { searchAutocomplete } = require('../../../services/music/library');

const autocomplete = (interaction) => searchAutocomplete(interaction, interaction.options.getFocused() || '');

module.exports = command({
    name: 'play',
    aliases: ['p'],
    description: 'Play a song or add it to the queue',
    options: [{ name: 'search', type: 'string', description: 'Song title or URL (YouTube, Spotify)', required: true, autocomplete: true }],
    guard: {},
    autocomplete,
    async run(ctx, { search }) {
        await ctx.loading('searching…');

        let res;
        try {
            res = await ctx.poru.resolve({ query: search, requester: ctx.user });
        } catch (e) {
            return ctx.respond(ui.fail(`failed to search: ${e?.message || 'unknown error'}`));
        }
        if (!res || res.loadType === 'empty' || !res.tracks?.length) return ctx.respond(ui.fail('no results found.'));
        if (res.loadType === 'error') return ctx.respond(ui.fail(`failed to load: ${res.exception?.message || 'unknown error'}`));

        const isPlaylist = res.loadType === 'playlist' || res.loadType === 'PLAYLIST_LOADED';
        let tracks = res.tracks;
        if (res.loadType === 'search') {
            tracks = tracks.filter((t) => !t.info.isStream && t.info.length > 70000);
            if (!tracks.length) return ctx.respond(ui.fail('no results found (filtered out shorts).'));
        }

        const player = await ensurePlayer(ctx);
        if (!player) return;

        if (isPlaylist) {
            enqueue(player, tracks, ctx.user);
            return ctx.respond(ui.addedPlaylistPayload(res.playlistInfo?.name || 'Playlist', tracks.length, ctx.user));
        }
        enqueue(player, [tracks[0]], ctx.user);
        return ctx.respond(ui.addedToQueuePayload(tracks[0]));
    },
});
