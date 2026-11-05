// grace · music · playlist
// ported from AeroX Music (AeroX Development). One hybrid command with subcommands:
//   /playlist create|save|load|append|list|delete|rename|share|import|add|remove|tracks
//   ,playlist <sub> <name> [| extra]

const { SlashCommandBuilder } = require('discord.js');
const crypto = require('crypto');
const { Ctx, guard, MSG } = require('../../../services/music/kit');
const { ensurePlayer, enqueue } = require('../../../services/music/session');
const { Playlist, PlaylistTrack } = require('../../../database/schemas');
const { trackData, formatDuration, safeTitle } = require('../../../services/music/helpers');
const lib = require('../../../services/music/library');
const E = require('../../../services/music/emojis');
const ui = require('../../../services/music/ui');

const SUBS = {
    create: 'Create a new empty playlist',
    save: 'Save the current queue as a playlist',
    load: 'Clear the queue and load a playlist',
    append: 'Add a playlist to the current queue',
    list: 'Show all of your saved playlists',
    delete: 'Delete one of your playlists',
    rename: 'Rename one of your playlists',
    share: 'Get a share code for a playlist',
    import: 'Import a playlist from a share code or Spotify URL',
    add: 'Add a single song to one of your playlists',
    remove: 'Remove a track from one of your playlists',
    tracks: 'Show the tracks inside a playlist',
};
// prefix spellings people will type
const ALIAS = { new: 'create', make: 'create', ls: 'list', all: 'list', del: 'delete', rm: 'delete', mv: 'rename', code: 'share', track: 'tracks', show: 'tracks', view: 'tracks', trackadd: 'add', trackremove: 'remove', unshare: 'share' };

const data = new SlashCommandBuilder().setName('playlist').setDescription('Manage your personal playlists');
const nameOpt = (o, d = 'Playlist name') => o.setName('name').setDescription(d).setRequired(true).setAutocomplete(true);
for (const [sub, desc] of Object.entries(SUBS)) {
    data.addSubcommand((s) => {
        s.setName(sub).setDescription(desc);
        if (['list'].includes(sub)) return s;
        if (sub === 'create' || sub === 'save') return s.addStringOption((o) => o.setName('name').setDescription('Name for the playlist').setRequired(true).setMaxLength(100));
        if (sub === 'import') return s.addStringOption((o) => o.setName('code').setDescription('Share code or Spotify playlist URL').setRequired(true));
        s.addStringOption((o) => nameOpt(o));
        if (sub === 'rename') s.addStringOption((o) => o.setName('new_name').setDescription('The new name').setRequired(true).setMaxLength(100));
        if (sub === 'add') s.addStringOption((o) => o.setName('search').setDescription('Song title or URL').setRequired(true).setAutocomplete(true));
        if (sub === 'remove') s.addIntegerOption((o) => o.setName('position').setDescription('Track position (see /playlist tracks)').setRequired(true).setMinValue(1));
        return s;
    });
}

const find = (userId, name, withTracks = false) => Playlist.findOne({
    where: { userId, name },
    ...(withTracks ? { include: [{ model: PlaylistTrack, as: 'tracks' }], order: [[{ model: PlaylistTrack, as: 'tracks' }, 'id', 'ASC']] } : {}),
});

async function atLimit(ctx) {
    const count = await Playlist.count({ where: { userId: ctx.user.id } });
    if (count >= lib.PLAYLIST_LIMIT()) { await ctx.fail(`you have reached the maximum playlist limit (**${lib.PLAYLIST_LIMIT()}** playlists)`); return true; }
    return false;
}

async function uniqueName(userId, base) {
    let name = base.slice(0, 100);
    for (let n = 2; await Playlist.findOne({ where: { userId, name } }); n++) name = `${base.slice(0, 90)} (${n})`;
    return name;
}

/** Brings tracks from stored rows into the player; used by load + append. */
async function pushRows(ctx, playlist, { clear }) {
    if (!playlist) return ctx.fail('playlist not found');
    if (!playlist.tracks?.length) return ctx.fail(`playlist **${playlist.name}** is empty`);
    if (!ctx.member.voice?.channel) return ctx.fail(MSG.needVoice);

    await ctx.loading('loading playlist…');
    const player = await ensurePlayer(ctx);
    if (!player) return;
    if (clear) player.queue.clear();

    const tracks = await lib.resolveRows(ctx.poru, playlist.tracks, ctx.user);
    if (!tracks.length) return ctx.respond(ui.fail('none of the songs in this playlist could be loaded'));
    enqueue(player, tracks, ctx.user);
    return ctx.respond(ui.ok(clear
        ? `loaded **${tracks.length}** songs from playlist **${safeTitle(playlist.name)}**`
        : `added **${tracks.length}** songs from playlist **${safeTitle(playlist.name)}** to the queue`));
}

const handlers = {
    async create(ctx, { name }) {
        if (await atLimit(ctx)) return;
        if (await find(ctx.user.id, name)) return ctx.fail(`you already have a playlist named **${name}**`);
        await Playlist.create({ userId: ctx.user.id, name });
        return ctx.ok(`created empty playlist **${safeTitle(name)}**. use \`playlist add\` to add songs to it`);
    },

    async save(ctx, { name }) {
        const player = ctx.player;
        if (!player || (!player.currentTrack && !player.queue.length)) return ctx.fail('the queue is empty! play some songs first');
        if (await atLimit(ctx)) return;
        if (await find(ctx.user.id, name)) return ctx.fail(`you already have a playlist named **${name}**`);
        const list = [player.currentTrack, ...player.queue].filter(Boolean);
        const playlist = await Playlist.create({ userId: ctx.user.id, name });
        await PlaylistTrack.bulkCreate(list.map((t) => ({ playlistId: playlist.id, ...trackData(t) })));
        return ctx.ok(`created playlist **${safeTitle(name)}** with **${list.length}** songs`);
    },

    async load(ctx, { name }) { return pushRows(ctx, await find(ctx.user.id, name, true), { clear: true }); },
    async append(ctx, { name }) { return pushRows(ctx, await find(ctx.user.id, name, true), { clear: false }); },

    async list(ctx) {
        const rows = await Playlist.findAll({ where: { userId: ctx.user.id }, include: [{ model: PlaylistTrack, as: 'tracks', attributes: ['id'] }], order: [['createdAt', 'ASC']] });
        if (!rows.length) return ctx.fail('you have no playlists yet. create one with `playlist create`');
        return lib.sendPaged(ctx, {
            title: `${E.playlist} Your playlists`,
            lines: rows.map((p, i) => `**${i + 1}.** ${safeTitle(p.name)} — \`${p.tracks?.length || 0}\` songs`),
            footer: `${rows.length}/${lib.PLAYLIST_LIMIT()}`,
        });
    },

    async delete(ctx, { name }) {
        const p = await find(ctx.user.id, name);
        if (!p) return ctx.fail(`playlist **${name}** not found`);
        await PlaylistTrack.destroy({ where: { playlistId: p.id } });
        await p.destroy();
        return ctx.ok(`deleted playlist **${safeTitle(name)}**`);
    },

    async rename(ctx, { name, new_name: newName }) {
        const p = await find(ctx.user.id, name);
        if (!p) return ctx.fail(`playlist **${name}** not found`);
        if (await find(ctx.user.id, newName)) return ctx.fail(`you already have a playlist named **${newName}**`);
        p.name = newName.slice(0, 250);
        await p.save();
        return ctx.ok(`renamed **${safeTitle(name)}** to **${safeTitle(newName)}**`);
    },

    async share(ctx, { name }) {
        const p = await find(ctx.user.id, name);
        if (!p) return ctx.fail(`playlist **${name}** not found`);
        if (!p.shareCode) {
            p.shareCode = `GRACE-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
            await p.save();
        }
        return ctx.respond(ui.statusPayload(`${E.success} | share code for **${safeTitle(p.name)}**: \`${p.shareCode}\`\nanyone can use \`playlist import ${p.shareCode}\` to copy it`));
    },

    async import(ctx, { code }) {
        code = code.trim();
        if (/^https?:\/\/open\.spotify\.com\/playlist\//i.test(code)) return importSpotify(ctx, code);

        const original = await Playlist.findOne({ where: { shareCode: code }, include: [{ model: PlaylistTrack, as: 'tracks' }] });
        if (!original) return ctx.fail('invalid share code or unsupported URL');
        if (await atLimit(ctx)) return;
        const name = await uniqueName(ctx.user.id, original.name);
        const copy = await Playlist.create({ userId: ctx.user.id, name });
        const rows = (original.tracks || []).map((t) => ({
            playlistId: copy.id, title: t.title, identifier: t.identifier, author: t.author, length: t.length, uri: t.uri, artworkUrl: t.artworkUrl,
        }));
        if (rows.length) await PlaylistTrack.bulkCreate(rows);
        return ctx.ok(`imported **${safeTitle(name)}** with **${rows.length}** songs`);
    },

    async add(ctx, { name, search }) {
        const p = await find(ctx.user.id, name);
        if (!p) return ctx.fail(`playlist **${name}** not found`);
        if (!ctx.poru) return ctx.fail(MSG.notConfigured);
        await ctx.loading('searching…');
        let res;
        try { res = await ctx.poru.resolve({ query: search, requester: ctx.user }); } catch (e) { return ctx.respond(ui.fail(`failed to search: ${e.message}`)); }
        const track = res?.tracks?.[0];
        if (!track || res.loadType === 'empty' || res.loadType === 'error') return ctx.respond(ui.fail('no results found'));
        await PlaylistTrack.create({ playlistId: p.id, ...trackData(track) });
        return ctx.respond(ui.ok(`added ${ui.link(track)} to playlist **${safeTitle(name)}**`));
    },

    async remove(ctx, { name, position }) {
        const p = await find(ctx.user.id, name, true);
        if (!p) return ctx.fail(`playlist **${name}** not found`);
        const t = p.tracks?.[position - 1];
        if (!t) return ctx.fail(`invalid position, the playlist has **${p.tracks?.length || 0}** tracks`);
        await t.destroy();
        return ctx.ok(`removed **${safeTitle(t.title)}** from playlist **${safeTitle(name)}**`);
    },

    async tracks(ctx, { name }) {
        const p = await find(ctx.user.id, name, true);
        if (!p) return ctx.fail(`playlist **${name}** not found`);
        if (!p.tracks?.length) return ctx.fail(`playlist **${name}** is empty`);
        return lib.sendPaged(ctx, {
            title: `${E.playlist} ${safeTitle(p.name)}`,
            lines: p.tracks.map((t, i) => `**${i + 1}.** [${lib.clip(safeTitle(t.title), 55)}](${t.uri || 'https://discord.com'}) \`${formatDuration(Number(t.length))}\``),
            footer: `${p.tracks.length} songs`,
        });
    },
};

async function importSpotify(ctx, url) {
    if (!ctx.poru) return ctx.fail(MSG.notConfigured);
    await ctx.loading('importing from spotify…');
    let res;
    try { res = await ctx.poru.resolve({ query: url, requester: ctx.user }); } catch (e) { return ctx.respond(ui.fail(`failed to import: ${e.message}`)); }
    if (!res?.tracks?.length || !['playlist', 'PLAYLIST_LOADED'].includes(res.loadType)) return ctx.respond(ui.fail('no results found or invalid playlist'));
    if (await atLimit(ctx)) return;
    const name = await uniqueName(ctx.user.id, res.playlistInfo?.name || 'Spotify Playlist');
    const playlist = await Playlist.create({ userId: ctx.user.id, name });
    await PlaylistTrack.bulkCreate(res.tracks.map((t) => ({ playlistId: playlist.id, ...trackData(t) })));
    return ctx.respond(ui.ok(`imported **${safeTitle(name)}** with **${res.tracks.length}** songs from spotify`));
}

// subcommands that take a free-text name as the rest of the message
const NEEDS = { create: 1, save: 1, load: 1, append: 1, delete: 1, share: 1, tracks: 1, import: 1 };

function parsePrefix(args, prefix) {
    let sub = (args[0] || '').toLowerCase();
    sub = ALIAS[sub] || sub;
    if (!handlers[sub]) {
        return { error: `usage: \`${prefix}playlist <${Object.keys(SUBS).join('|')}> …\`\nuse \`|\` to split two values, e.g. \`${prefix}playlist add chill | lofi beats\`` };
    }
    const rest = args.slice(1).join(' ').trim();
    const [a, b] = rest.split('|').map((x) => x.trim());
    const need = (v) => (v ? null : { error: `usage: \`${prefix}playlist ${sub} …\`` });
    switch (sub) {
        case 'list': return { sub, params: {} };
        case 'rename': return need(a && b) || { sub, params: { name: a, new_name: b } };
        case 'add': return need(a && b) || { sub, params: { name: a, search: b } };
        case 'remove': { const n = parseInt(b, 10); return need(a && n > 0) || { sub, params: { name: a, position: n } }; }
        case 'import': return need(rest) || { sub, params: { code: rest } };
        default: return need(rest) || { sub, params: { name: rest } };
    }
}

module.exports = {
    data,
    name: 'playlist',
    aliases: ['pl', 'playlists'],
    description: 'Manage your personal playlists',
    category: 'music',

    async autocomplete(interaction) {
        const f = interaction.options.getFocused(true);
        if (f.name === 'search') return lib.searchAutocomplete(interaction, f.value);
        if (f.name === 'name') return lib.playlistAutocomplete(interaction, f.value);
        return interaction.respond([]).catch(() => {});
    },

    async execute(src, args = []) {
        const ctx = new Ctx(src, args);
        if (!(await guard(ctx, { voice: false }))) return;
        let sub; let params;
        if (ctx.isSlash) {
            sub = src.options.getSubcommand();
            params = {
                name: src.options.getString('name'),
                new_name: src.options.getString('new_name'),
                code: src.options.getString('code'),
                search: src.options.getString('search'),
                position: src.options.getInteger('position'),
            };
        } else {
            const parsed = parsePrefix(args, ctx.prefix);
            if (parsed.error) return ctx.fail(parsed.error);
            ({ sub, params } = parsed);
        }
        try {
            return await handlers[sub](ctx, params);
        } catch (e) {
            console.error(`[music] playlist ${sub} failed:`, e);
            return ctx.respond(ui.fail('something went wrong with that playlist action'));
        }
    },
};
