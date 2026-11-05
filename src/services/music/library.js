/*
 * grace · music · personal library helpers (playlists + favorites)
 * shared by the `playlist` and `favorite` commands.
 */

const { ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const ui = require('./ui');
const E = require('./emojis');
const { formatDuration } = require('./helpers');
const { Playlist, PlaylistTrack } = require('../../database/schemas');
const config = require('../../settings');

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Autocomplete for a free-text song query (shared by play, playlist add, favorite add). */
async function searchAutocomplete(interaction, focused) {
    const { client } = interaction;
    try {
        if (!focused?.trim()) return await interaction.respond([]);
        if (/^https?:\/\//i.test(focused)) {
            const label = /spotify/i.test(focused) ? 'Spotify' : /youtu/i.test(focused) ? 'YouTube' : 'URL';
            return await interaction.respond([{ name: clip(`Play ${label}: ${focused}`, 100), value: focused.slice(0, 100) }]);
        }
        if (!client.poru?.resolve) return await interaction.respond([]);

        const cache = (client._musicAutocompleteCache ||= new Map());
        if (cache.has(focused)) return await interaction.respond(cache.get(focused));

        const res = await client.poru.resolve({ query: focused, source: config.MUSIC.DEFAULT_PLATFORM || 'ytsearch', requester: interaction.user });
        const choices = (res?.tracks || []).slice(0, config.MUSIC.AUTOCOMPLETE_LIMIT || 10).map((t) => ({
            name: clip(`${t.info.title} [${formatDuration(t.info.length)}]`, 100),
            value: String(t.info.uri || '').slice(0, 100),
        })).filter((c) => c.value);
        cache.set(focused, choices);
        if (cache.size > 200) cache.delete(cache.keys().next().value);
        return await interaction.respond(choices);
    } catch {
        return interaction.respond([]).catch(() => {});
    }
}

/** Autocomplete for the caller's playlist names. */
async function playlistAutocomplete(interaction, focused) {
    try {
        const rows = await Playlist.findAll({ where: { userId: interaction.user.id }, limit: 100 });
        const f = String(focused || '').toLowerCase();
        const out = rows.map((r) => r.name).filter((n) => n.toLowerCase().includes(f)).slice(0, 25)
            .map((n) => ({ name: clip(n, 100), value: n.slice(0, 100) }));
        return await interaction.respond(out);
    } catch {
        return interaction.respond([]).catch(() => {});
    }
}

/** Resolve stored rows ({ uri }) back into Poru tracks, a few at a time. */
async function resolveRows(poru, rows, user) {
    const tracks = [];
    for (let i = 0; i < rows.length; i += 5) {
        const chunk = rows.slice(i, i + 5);
        const res = await Promise.all(chunk.map((r) => poru.resolve({ query: r.uri, requester: user }).catch(() => null)));
        for (const r of res) if (r?.tracks?.[0]) tracks.push(r.tracks[0]);
    }
    return tracks;
}

/** A paged, button-driven list container. `lines` are already formatted strings. */
async function sendPaged(ctx, { title, lines, perPage = 8, footer }) {
    const pages = Math.max(1, Math.ceil(lines.length / perPage));
    let page = 0;

    const build = (disabled = false) => {
        const slice = lines.slice(page * perPage, page * perPage + perPage);
        const c = new ContainerBuilder().setAccentColor(ui.WHITE)
            .addTextDisplayComponents(ui.text(`## ${title}`))
            .addSeparatorComponents(ui.divider())
            .addTextDisplayComponents(ui.text(slice.join('\n') || '*nothing here yet*'))
            .addSeparatorComponents(ui.divider())
            .addTextDisplayComponents(ui.text(`-# page ${page + 1}/${pages}${footer ? ` · ${footer}` : ''}`));
        if (pages > 1) {
            c.addActionRowComponents(new ActionRowBuilder().addComponents(
                ui.iconButton('lib_prev', E.prevPage, { disabled: disabled || page === 0 }),
                ui.iconButton('lib_next', E.nextPage, { disabled: disabled || page >= pages - 1 }),
            ));
        }
        return { components: [c], flags: ui.V2_FLAGS, allowedMentions: ui.NO_PINGS };
    };

    const msg = await ctx.respond(build());
    if (pages <= 1) return msg;

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
    collector.on('collect', async (i) => {
        if (i.user.id !== ctx.user.id) return i.reply({ content: 'only the command user can flip these pages.', flags: 64 }).catch(() => {});
        page = Math.min(pages - 1, Math.max(0, page + (i.customId === 'lib_next' ? 1 : -1)));
        await i.update(build()).catch(() => {});
    });
    collector.on('end', () => msg.edit(build(true)).catch(() => {}));
    return msg;
}

const PLAYLIST_LIMIT = () => config.MUSIC.PLAYLIST_LIMIT || 10;

module.exports = {
    clip, searchAutocomplete, playlistAutocomplete, resolveRows, sendPaged, PLAYLIST_LIMIT,
};
