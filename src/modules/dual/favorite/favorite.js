// grace · music · favorite
// ported from AeroX Music (AeroX Development). /favorite add|remove|list|play

const { SlashCommandBuilder } = require('discord.js');
const { Ctx, guard, MSG } = require('../../../services/music/kit');
const { ensurePlayer, enqueue } = require('../../../services/music/session');
const { Favorite } = require('../../../database/schemas');
const { trackData, formatDuration, safeTitle } = require('../../../services/music/helpers');
const lib = require('../../../services/music/library');
const E = require('../../../services/music/emojis');
const ui = require('../../../services/music/ui');

const data = new SlashCommandBuilder().setName('favorite').setDescription('Manage your favorite songs')
    .addSubcommand((s) => s.setName('add').setDescription('Add a song to your favorites (empty = current track)')
        .addStringOption((o) => o.setName('search').setDescription('Song title or URL').setAutocomplete(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a song from your favorites')
        .addStringOption((o) => o.setName('name').setDescription('The song to remove').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show your favorite songs'))
    .addSubcommand((s) => s.setName('play').setDescription('Play all of your favorites')
        .addBooleanOption((o) => o.setName('append').setDescription('Add to the current queue instead of replacing it')));

const mine = (userId) => Favorite.findAll({ where: { userId }, order: [['id', 'ASC']] });

const handlers = {
    async add(ctx, { search }) {
        let track;
        if (!search) {
            track = ctx.player?.currentTrack;
            if (!track) return ctx.fail('nothing is playing, give me a song title or URL to add');
        } else {
            if (!ctx.poru) return ctx.fail(MSG.notConfigured);
            await ctx.loading('searching…');
            let res;
            try { res = await ctx.poru.resolve({ query: search, requester: ctx.user }); } catch (e) { return ctx.respond(ui.fail(`failed to search: ${e.message}`)); }
            track = res?.tracks?.[0];
            if (!track || res.loadType === 'empty' || res.loadType === 'error') return ctx.respond(ui.fail('no results found'));
        }
        const d = trackData(track);
        const existing = await Favorite.findOne({ where: { userId: ctx.user.id, identifier: d.identifier } });
        if (existing) return ctx.respond(ui.fail('that song is already in your favorites'));
        await Favorite.create({ userId: ctx.user.id, title: d.title, identifier: d.identifier, author: d.author, length: d.length, uri: d.uri });
        return ctx.respond(ui.statusPayload(`${E.heart} | added ${ui.link(track)} to your favorites`));
    },

    async remove(ctx, { name }) {
        const q = name.toLowerCase();
        const favs = await mine(ctx.user.id);
        const hit = favs.find((f) => f.title.slice(0, 100).toLowerCase() === q || f.title.toLowerCase() === q || f.identifier === name || f.uri === name)
            || favs.find((f) => f.title.toLowerCase().includes(q));
        if (!hit) return ctx.fail('that song is not in your favorites');
        await hit.destroy();
        return ctx.ok(`removed **${safeTitle(hit.title)}** from your favorites`);
    },

    async list(ctx) {
        const favs = await mine(ctx.user.id);
        if (!favs.length) return ctx.fail('you have no favorite songs yet');
        return lib.sendPaged(ctx, {
            title: `${E.heart} Your favorites`,
            lines: favs.map((f, i) => `**${i + 1}.** [${lib.clip(safeTitle(f.title), 55)}](${f.uri || 'https://discord.com'}) — \`${formatDuration(Number(f.length))}\``),
            footer: `${favs.length} songs`,
        });
    },

    async play(ctx, { append }) {
        const favs = await mine(ctx.user.id);
        if (!favs.length) return ctx.fail('you have no favorite songs yet');
        if (!ctx.member.voice?.channel) return ctx.fail(MSG.needVoice);
        await ctx.loading('loading favorites…');
        const player = await ensurePlayer(ctx);
        if (!player) return;
        if (!append) player.queue.clear();
        const tracks = await lib.resolveRows(ctx.poru, favs, ctx.user);
        if (!tracks.length) return ctx.respond(ui.fail('none of your favorites could be loaded'));
        enqueue(player, tracks, ctx.user);
        return ctx.respond(ui.ok(`${append ? 'added' : 'loaded'} **${tracks.length}** favorites ${append ? 'to the queue' : ''}`.trim()));
    },
};

module.exports = {
    data,
    name: 'favorite',
    aliases: ['fav', 'favorites', 'favourite'],
    description: 'Manage your favorite songs',
    category: 'music',

    async autocomplete(interaction) {
        const f = interaction.options.getFocused(true);
        if (f.name === 'search') return lib.searchAutocomplete(interaction, f.value);
        try {
            const q = String(f.value || '').toLowerCase();
            const favs = await mine(interaction.user.id);
            return await interaction.respond(favs.filter((x) => x.title.toLowerCase().includes(q)).slice(0, 25)
                .map((x) => ({ name: lib.clip(x.title, 100), value: x.title.slice(0, 100) })));
        } catch { return interaction.respond([]).catch(() => {}); }
    },

    async execute(src, args = []) {
        const ctx = new Ctx(src, args);
        if (!(await guard(ctx, { voice: false }))) return;
        let sub; let params = {};
        if (ctx.isSlash) {
            sub = src.options.getSubcommand();
            params = { search: src.options.getString('search'), name: src.options.getString('name'), append: !!src.options.getBoolean('append') };
        } else {
            sub = (args[0] || 'list').toLowerCase();
            sub = { ls: 'list', rm: 'remove', delete: 'remove', del: 'remove', p: 'play' }[sub] || sub;
            if (!handlers[sub]) return ctx.fail(`usage: \`${ctx.prefix}favorite <add|remove|list|play>\``);
            const rest = args.slice(1).join(' ').trim();
            if (sub === 'add') params = { search: rest || null };
            else if (sub === 'remove') { if (!rest) return ctx.fail(`usage: \`${ctx.prefix}favorite remove <song name>\``); params = { name: rest }; }
            else if (sub === 'play') params = { append: /^(append|add|yes|true)$/i.test(rest) };
        }
        try {
            return await handlers[sub](ctx, params);
        } catch (e) {
            console.error(`[music] favorite ${sub} failed:`, e);
            return ctx.respond(ui.fail('something went wrong with that favorites action'));
        }
    },
};
