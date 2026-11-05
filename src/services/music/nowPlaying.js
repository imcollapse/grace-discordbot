/*
 * grace · music · now playing
 * One card per track: cover art, a drawn progress bar tinted from the cover, a few quick buttons and
 * "Open music controls" which shows a private panel with every control (playback, queue, lyrics, filters...).
 */

const {
    ContainerBuilder, SectionBuilder, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags,
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const U = require('../cardArt');
const E = require('./emojis');
const ui = require('./ui');
const { formatDuration, safeTitle, hasControlPermission, trackData } = require('./helpers');
const { parseEmoji } = require('../ui');

const EPH = MessageFlags.Ephemeral;
const V2 = ui.V2_FLAGS;
const NO = ui.NO_PINGS;

/* ── progress image ────────────────────────────────────────────────── */

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function hslToRgb(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360 / 360;
    return [h, s, l];
}
const hex = ([r, g, b]) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;

const FALLBACK = '#8c9bff';
/** A colour pulled from the cover art: the most colourful part, lifted so it reads on a dark card. */
async function accentOf(track) {
    if (track._accent) return track._accent;
    let out = FALLBACK;
    const url = track?.info?.artworkUrl || track?.info?.image;
    if (url) {
        try {
            const img = await loadImage(url);
            const c = createCanvas(16, 16), g = c.getContext('2d');
            g.drawImage(img, 0, 0, 16, 16);
            const px = g.getImageData(0, 0, 16, 16).data;
            let r = 0, gg = 0, b = 0, w = 0;
            for (let i = 0; i < px.length; i += 4) {
                const [, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
                const weight = 0.05 + s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.6);
                r += px[i] * weight; gg += px[i + 1] * weight; b += px[i + 2] * weight; w += weight;
            }
            if (w) {
                const [h, s] = rgbToHsl(r / w, gg / w, b / w);
                out = hex(hslToRgb(h, clamp(s * 0.9, 0.4, 0.8), 0.68));
            }
        } catch { /* no art: keep the default */ }
    }
    track._accent = out;
    return out;
}

const W = 1040, H = 108;

function drawBar({ position, length, stream, paused, accent, note }) {
    U.registerFonts();
    const c = createCanvas(W, H), g = c.getContext('2d');
    const x0 = 10, x1 = W - 10, y = 30, h = 12;
    const ratio = stream ? 1 : clamp(length ? position / length : 0, 0, 1);
    const fillTo = x0 + (x1 - x0) * ratio;

    // a plain progress line
    g.fillStyle = 'rgba(245,243,238,.14)'; g.fillRect(x0, y - 2, x1 - x0, 4);
    g.fillStyle = accent; g.fillRect(x0, y - 2, Math.max(0, fillTo - x0), 4);
    // times
    const left = stream ? 'LIVE' : formatDuration(position);
    const right = stream ? '' : formatDuration(length);
    U.text(g, left, x0, 82, { font: U.FONT.regular, size: 26, color: stream ? accent : 'rgba(245,243,238,.9)', spacing: stream ? 3 : 0 });
    if (right) U.text(g, right, x1, 82, { font: U.FONT.regular, size: 26, color: 'rgba(245,243,238,.5)', align: 'right' });
    // status in the middle
    U.text(g, note, W / 2, 80, { font: U.FONT.regular, size: 21, color: paused ? U.rgba(accent, 0.95) : 'rgba(255,255,255,.42)', align: 'center', spacing: 2 });
    return c.toBuffer('image/png');
}

const loopWord = (p) => ({ TRACK: 'LOOP TRACK', QUEUE: 'LOOP QUEUE' }[p.loop] ?? null);
const statusNote = (player) => [player.isPaused ? 'PAUSED' : 'PLAYING', loopWord(player), player.autoplayEnabled ? 'AUTOPLAY' : null, `VOL ${player.volume ?? 100}`].filter(Boolean).join('   ·   ');

/* ── buttons ───────────────────────────────────────────────────────── */

/** An icon button; when the emoji is missing it falls back to a text label so Discord accepts it. */
function btn(id, emoji, label, { style = ButtonStyle.Secondary, disabled = false, text = false } = {}) {
    const b = new ButtonBuilder().setCustomId(id).setStyle(style).setDisabled(disabled);
    const e = parseEmoji(emoji);
    if (e) b.setEmoji(e);
    if (label && (!e || text)) b.setLabel(label);
    return b;
}
const row = (...b) => new ActionRowBuilder().addComponents(...b);

/* ── the card ──────────────────────────────────────────────────────── */

const sourceName = (t) => ({ youtube: 'YouTube', youtubemusic: 'YouTube Music', spotify: 'Spotify', soundcloud: 'SoundCloud', applemusic: 'Apple Music', deezer: 'Deezer', bandcamp: 'Bandcamp', twitch: 'Twitch', http: 'Direct link' }[String(t.info.sourceName || '').toLowerCase()] ?? null);
const requester = (t) => t?.info?.requester?.username || t?.info?.requester?.globalName || null;

async function payload(player, track, { disabled = false, edit = false } = {}) {
    const info = track.info;
    const accent = await accentOf(track);
    const buf = drawBar({ position: disabled ? (info.length || 0) : (player.position || 0), length: info.length || 0, stream: !!info.isStream, paused: !!player.isPaused && !disabled, accent, note: disabled ? 'ENDED' : statusNote(player) });
    const file = new AttachmentBuilder(buf, { name: `np_${Date.now().toString(36)}.png` });

    const meta = [requester(track) ? `Requested by ${requester(track)}` : null, sourceName(track)].filter(Boolean).join('  ·  ');
    const body = `-# ${disabled ? 'Played' : 'Now playing'}\n### [${safeTitle(info.title)}](${info.uri || 'https://discord.com'})\n${info.author || 'Unknown artist'}${meta ? `\n-# ${meta}` : ''}`;

    const c = new ContainerBuilder();
    const art = info.artworkUrl || info.image;
    if (art) c.addSectionComponents(new SectionBuilder().addTextDisplayComponents(ui.text(body)).setThumbnailAccessory(new ThumbnailBuilder().setDescription(safeTitle(info.title).slice(0, 200)).setURL(art)));
    else c.addTextDisplayComponents(ui.text(body));
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${file.name}`)));
    c.addActionRowComponents(row(
        btn('music_pause_resume', player.isPaused ? E.play : E.pause, player.isPaused ? 'Resume' : 'Pause', { disabled }),
        btn('music_skip', E.skip, 'Skip', { disabled }),
        btn('music_favorite', E.heart, 'Like', { style: ButtonStyle.Success, disabled }),
        btn('music_refresh', null, 'Refresh', { disabled, text: true }),
    ));
    c.addActionRowComponents(row(
        btn('music_controls', E.filter, 'Open music controls', { disabled, text: true }),
        btn('music_close', null, '✕', { disabled, text: true }),
    ));
    const out = { components: [c], files: [file], flags: V2, allowedMentions: NO };
    if (edit) out.attachments = [];
    return out;
}

/* ── private controls panel ────────────────────────────────────────── */

function panelPayload(player, { note = null } = {}) {
    const t = player.currentTrack || player._lastPlayedTrack;
    const info = t.info;
    const c = new ContainerBuilder();
    c.addTextDisplayComponents(ui.text(`**[${safeTitle(info.title)}${info.author ? ` — ${info.author}` : ''}](${info.uri || 'https://discord.com'})**\n-# ${info.isStream ? 'Live' : `${formatDuration(player.position || 0)} / ${formatDuration(info.length)}`}  ·  Volume ${player.volume ?? 100}`));
    const on = (v) => (v ? ButtonStyle.Primary : ButtonStyle.Secondary);

    c.addSeparatorComponents(ui.divider());
    c.addTextDisplayComponents(ui.text('-# Playback'));
    c.addActionRowComponents(row(
        btn('mpc_prev', E.previous, 'Back'),
        btn('mpc_pause', player.isPaused ? E.play : E.pause, player.isPaused ? 'Resume' : 'Pause', { style: ButtonStyle.Primary }),
        btn('mpc_skip', E.skip, 'Skip'),
        btn('mpc_stop', E.stop, 'Stop', { style: ButtonStyle.Danger }),
    ));
    c.addTextDisplayComponents(ui.text('-# Music'));
    c.addActionRowComponents(row(
        btn('mpc_queue', E.queue, 'Queue'),
        btn('mpc_lyrics', E.lyrics, 'Lyrics'),
        btn('mpc_loop', E.loop, 'Loop', { style: on(player.loop && player.loop !== 'NONE') }),
        btn('mpc_shuffle', E.shuffle, 'Shuffle'),
        btn('mpc_autoplay', E.autoplay, 'Autoplay', { style: on(player.autoplayEnabled) }),
    ));
    c.addTextDisplayComponents(ui.text('-# Controls'));
    c.addActionRowComponents(row(
        btn('mpc_like', E.heart, 'Like'),
        btn('mpc_voldown', E.volume, 'Vol -', { text: true }),
        btn('mpc_volup', E.volume, 'Vol +', { text: true }),
        btn('mpc_filters', E.filter, 'Filters'),
    ));
    c.addTextDisplayComponents(ui.text('-# Library'));
    c.addActionRowComponents(row(
        btn('mpc_liked', E.playlist, 'Liked songs'),
        btn('mpc_history', E.seek, 'History'),
    ));
    if (note) c.addTextDisplayComponents(ui.text(ui.sub ? ui.sub(note) : `-# ${note}`));
    return { components: [c], flags: V2 | EPH, allowedMentions: NO };
}

/* ── actions ───────────────────────────────────────────────────────── */

const eph = (p) => ({ ...p, flags: (p.flags ?? V2) | EPH });
const FILTERS = [['nightcore', 'Nightcore'], ['vaporwave', 'Vaporwave'], ['bassboost', 'Bass boost'], ['eightD', '8D'], ['karaoke', 'Karaoke'], ['vibrato', 'Vibrato'], ['tremolo', 'Tremolo'], ['slowed', 'Slowed'], ['distortion', 'Distortion'], ['pop', 'Pop'], ['soft', 'Soft']];
const POP = [[1, 0.35], [2, 0.25], [3, 0], [4, -0.25], [5, -0.3], [6, -0.2], [7, -0.1], [8, 0.15], [9, 0.25]];
const SOFT = [...Array(8).keys()].map(b => [b, 0]).concat([8, 9, 10, 11, 12, 13].map(b => [b, -0.25]));
const eq = (pairs) => pairs.map(([band, gain]) => ({ band, gain }));
function applyFilter(f, id) {
    switch (id) {
        case 'nightcore': return f.setNightcore(true);
        case 'vaporwave': return f.setVaporwave(true);
        case 'bassboost': return f.setBassboost(true);
        case 'eightD': return f.set8D(true);
        case 'karaoke': return f.setKaraoke(true);
        case 'vibrato': return f.setVibrato(true);
        case 'tremolo': return f.setTremolo(true);
        case 'slowed': return f.setSlowmode(true);
        case 'distortion': return f.setDistortion(true);
        case 'pop': return f.setEqualizer(eq(POP));
        case 'soft': return f.setEqualizer(eq(SOFT));
        default: return null;
    }
}

async function toggleLike(user, track) {
    const { Favorite } = require('../../database/schemas');
    const where = { userId: user.id, identifier: String(track.info.identifier).slice(0, 250) };
    const have = await Favorite.findOne({ where });
    if (have) { await have.destroy(); return false; }
    const d = trackData(track);
    await Favorite.create({ userId: user.id, identifier: d.identifier, title: d.title, author: d.author, length: d.length, uri: d.uri });
    return true;
}

/** Re-draws the public card after something changed (pause, loop, volume...). */
async function refreshMain(player) {
    const msg = player.nowPlayingMessage, t = player.currentTrack || player._lastPlayedTrack;
    if (!msg || !t) return;
    msg.edit(await payload(player, t, { edit: true })).catch(() => {});
}

/** Private reply with its own collector. */
async function privateReply(i, body, onClick, time = 300000) {
    const res = await (i.deferred || i.replied ? i.editReply(body) : i.reply({ ...body, withResponse: true }));
    const msg = res?.resource?.message ?? res;
    if (!onClick || !msg?.id) return msg;
    const col = i.channel.createMessageComponentCollector({ filter: x => x.message.id === msg.id && x.user.id === i.user.id, time });
    col.on('collect', (x) => onClick(x, col).catch(e => console.error('[music] panel:', e.message)));
    return msg;
}

const small = (t) => ({ components: [ui.statusContainer(t)], flags: V2 | EPH, allowedMentions: NO });

async function openQueue(i, player) {
    let page = 1;
    const view = () => { const q = ui.buildQueuePayload(player, page); page = q.page; return eph(q); };
    await privateReply(i, view(), async (x) => {
        const [, action] = x.customId.split('_');
        if (action === 'delete') { await x.deferUpdate().catch(() => {}); return i.deleteReply().catch(() => {}); }
        if (action === 'home') page = 1; else if (action === 'prev') page -= 1; else if (action === 'next') page += 1; else return;
        await x.update(view());
    });
}

async function openLyrics(i, player) {
    await i.deferReply({ flags: EPH });
    const t = player.currentTrack || player._lastPlayedTrack;
    const found = await require('./lyrics').findLyrics(t).catch(() => null);
    if (!found) return i.editReply({ components: [ui.statusContainer(`${E.error} | no lyrics found for **${safeTitle(t.info.title)}**`)], flags: V2, allowedMentions: NO });
    const lyrics = found.lyrics.replace(/\[\d+:\d+(?:\.\d+)?\]\s*/g, '').trim();
    const c = new ContainerBuilder()
        .addTextDisplayComponents(ui.text(`### ${safeTitle(found.title)}\n-# ${found.artist}`))
        .addSeparatorComponents(ui.divider())
        .addTextDisplayComponents(ui.text(lyrics.length > 3300 ? `${lyrics.slice(0, 3300).trimEnd()}…` : lyrics))
        .addTextDisplayComponents(ui.text(`-# Source: ${found.source}`));
    return i.editReply({ components: [c], flags: V2, allowedMentions: NO });
}

async function openFilters(i, player) {
    const { customFilter } = require('poru');
    const menu = new StringSelectMenuBuilder().setCustomId('mpc_filter_pick').setPlaceholder('Pick a filter')
        .addOptions([...FILTERS.map(([value, label]) => ({ label, value })), { label: 'Reset all filters', value: 'reset' }]);
    const c = new ContainerBuilder().addTextDisplayComponents(ui.text('### Audio filters\n-# Pick one to apply it to the music'))
        .addActionRowComponents(new ActionRowBuilder().addComponents(menu));
    await privateReply(i, { components: [c], flags: V2 | EPH, allowedMentions: NO }, async (x) => {
        const live = i.client.poru?.players?.get(player.guildId);
        if (!live) return;
        if (!(live.filters instanceof customFilter)) live.filters = new customFilter(live);
        const id = x.values[0];
        try {
            if (id === 'reset') live.filters.clearFilters(true); else applyFilter(live.filters, id);
            await live.filters.updateFilters();
            await x.reply(small(`${E.success} | ${id === 'reset' ? 'all filters reset' : `applied **${FILTERS.find(f => f[0] === id)[1]}**`}`));
        } catch (e) { await x.reply(small(`${E.error} | could not apply that filter`)); }
    });
}

async function openLiked(i) {
    const { Favorite } = require('../../database/schemas');
    const favs = await Favorite.findAll({ where: { userId: i.user.id }, order: [['id', 'DESC']], limit: 15 });
    const body = favs.length ? favs.map((f, n) => `**${n + 1}.** [${safeTitle(f.title).slice(0, 55)}](${f.uri || 'https://discord.com'}) · \`${formatDuration(Number(f.length))}\``).join('\n') : 'You have not liked any songs yet. Press Like while something plays.';
    const c = new ContainerBuilder().addTextDisplayComponents(ui.text(`### Liked songs\n${body}`)).addTextDisplayComponents(ui.text('-# Play them all with the favorite play command'));
    return i.reply({ components: [c], flags: V2 | EPH, allowedMentions: NO });
}

function openHistory(i, player) {
    const list = i.client.guildMusicStates?.get(player.guildId)?.previousTracks ?? [];
    const body = list.length ? list.slice(0, 10).map((t, n) => `**${n + 1}.** [${safeTitle(t.info.title).slice(0, 55)}](${t.info.uri || 'https://discord.com'}) · ${t.info.author || 'Unknown'}`).join('\n') : 'Nothing has played before this track yet.';
    const c = new ContainerBuilder().addTextDisplayComponents(ui.text(`### Recently played\n${body}`));
    return i.reply({ components: [c], flags: V2 | EPH, allowedMentions: NO });
}

async function stopPlayer(client, player) {
    const stay = require('./stay');
    player.queue.clear();
    if (stay.isOn(player.guildId)) {
        if (typeof player.stop === 'function') await player.stop(); else player.skip();
        stay.setStatus(client, player.guildId, 'idle', player);
    } else player.destroy();
}

/** The panel: opens it and wires its buttons. */
async function openPanel(client, player, i, deps) {
    const current = () => player.currentTrack || player._lastPlayedTrack;
    await privateReply(i, panelPayload(player), async (x) => {
        const live = client.poru?.players?.get(player.guildId);
        if (!live) return x.update({ components: [ui.statusContainer(`${E.error} | the player has ended`)], flags: V2 | EPH });
        if (x.member?.voice?.channelId !== live.voiceChannel) return x.reply(small(`${E.error} | you must be in the same voice channel as the bot`));
        const gated = ['mpc_prev', 'mpc_pause', 'mpc_skip', 'mpc_stop', 'mpc_loop', 'mpc_shuffle', 'mpc_autoplay', 'mpc_voldown', 'mpc_volup', 'mpc_filters'];
        if (gated.includes(x.customId) && !hasControlPermission(x, live)) return x.reply(small(`${E.error} | only the requester, admins, or server managers can do that`));

        let note = null;
        switch (x.customId) {
            case 'mpc_pause': await live.pause(!live.isPaused); break;
            case 'mpc_skip': await x.deferUpdate(); live.skip(); return;
            case 'mpc_prev':
                if (!client.guildMusicStates?.get(live.guildId)?.previousTracks?.length) return x.reply(small(`${E.error} | no previous track in history`));
                await x.deferUpdate(); deps.playPrevious(client, live); return;
            case 'mpc_stop': await x.update(small(`${E.stop} | stopped music and cleared the queue`)); await stopPlayer(client, live); return;
            case 'mpc_loop': live.setLoop({ NONE: 'TRACK', TRACK: 'QUEUE', QUEUE: 'NONE' }[live.loop] || 'TRACK'); note = `Loop: ${{ NONE: 'off', TRACK: 'track', QUEUE: 'queue' }[live.loop] ?? 'off'}`; break;
            case 'mpc_shuffle':
                if (live.queue.length < 2) { note = 'Not enough tracks in the queue to shuffle'; break; }
                live.queue.shuffle(); note = 'Queue shuffled'; break;
            case 'mpc_autoplay': live.autoplayEnabled = !live.autoplayEnabled; note = `Autoplay ${live.autoplayEnabled ? 'on' : 'off'}`; break;
            case 'mpc_voldown': await live.setVolume(clamp((live.volume ?? 100) - 10, 1, 100)); note = `Volume ${live.volume}`; break;
            case 'mpc_volup': await live.setVolume(clamp((live.volume ?? 100) + 10, 1, 100)); note = `Volume ${live.volume}`; break;
            case 'mpc_like': note = (await toggleLike(x.user, current())) ? 'Added to your liked songs' : 'Removed from your liked songs'; break;
            case 'mpc_queue': return openQueue(x, live);
            case 'mpc_lyrics': return openLyrics(x, live);
            case 'mpc_filters': return openFilters(x, live);
            case 'mpc_liked': return openLiked(x);
            case 'mpc_history': return openHistory(x, live);
            default: return;
        }
        await x.update(panelPayload(live, { note }));
        refreshMain(live);
    });
}

/* ── public card buttons ───────────────────────────────────────────── */

async function handle(client, player, i, deps) {
    const same = i.member?.voice?.channelId && i.member.voice.channelId === player.voiceChannel;
    const current = player.currentTrack || player._lastPlayedTrack;

    if (i.customId === 'music_refresh') return i.update(await payload(player, current, { edit: true }));   // anyone may refresh
    if (!same) return i.reply(small(`${E.error} | you must be in the same voice channel as the bot`));

    switch (i.customId) {
        case 'music_pause_resume':
            await player.pause(!player.isPaused);
            return i.update(await payload(player, current, { edit: true }));
        case 'music_skip': await i.deferUpdate(); return player.skip();
        case 'music_favorite': {
            if (!current) return i.reply(small(`${E.error} | nothing is playing`));
            const added = await toggleLike(i.user, current);
            return i.reply(small(`${E.heart} | ${added ? 'added' : 'removed'} **${safeTitle(current.info.title)}** ${added ? 'to' : 'from'} your liked songs`));
        }
        case 'music_controls': return openPanel(client, player, i, deps);
        case 'music_close': {
            if (!hasControlPermission(i, player)) return i.reply(small(`${E.error} | only the requester, admins, or server managers can close this`));
            player.buttonCollector?.stop('closed');
            await i.deferUpdate().catch(() => {});
            player.nowPlayingMessage = null;
            return i.message.delete().catch(() => {});
        }
        default: return undefined;
    }
}

module.exports = { payload, handle, panelPayload, accentOf, drawBar };
