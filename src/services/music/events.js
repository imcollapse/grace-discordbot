/*
 * grace · music · player events (ported from AeroX Music)
 * trackStart -> now playing message + buttons, queueEnd -> autoplay, cleanup on destroy.
 */

const { ContainerBuilder, TextDisplayBuilder, MessageFlags, ComponentType } = require('discord.js');
const { Favorite } = require('../../database/schemas');
const ui = require('./ui');
const E = require('./emojis');
const { trackData } = require('./helpers');
const { printInfo, printError } = require('../consoleLogger');
const stay = require('./stay');
const np = require('./nowPlaying');

const HISTORY_LIMIT = 20;

function say(client, player, text) {
    const channel = client.channels.cache.get(player.textChannel);
    if (!channel) return Promise.resolve();
    return channel.send({
        components: [new ContainerBuilder().setAccentColor(ui.WHITE).addTextDisplayComponents(new TextDisplayBuilder().setContent(text))],
        flags: ui.V2_FLAGS,
        allowedMentions: ui.NO_PINGS,
    }).catch(() => {});
}

function disableNowPlaying(player) {
    const msg = player.nowPlayingMessage;
    if (!msg || !player._lastPlayedTrack) return;
    np.payload(player, player._lastPlayedTrack, { disabled: true, edit: true }).then(p => msg.edit(p)).catch(() => {});
}

function stopCollectors(player, reason = 'cleanup') {
    for (const key of ['buttonCollector', 'filterCollector']) {
        if (player[key]) {
            try { player[key].stop(reason); } catch (_) { /* already stopped */ }
            player[key] = null;
        }
    }
}

const normalize = (t) => t.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\[.*?\]\s*/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

async function runAutoplay(client, player) {
    const last = player._lastPlayedTrack || player.currentTrack;
    if (!last?.info) return;
    try {
        const title = last.info.title || '';
        let res;
        if ((last.info.uri || '').includes('youtube.com')) {
            res = await client.poru.resolve({
                query: `https://music.youtube.com/watch?v=${last.info.identifier}&list=RD${last.info.identifier}`,
                source: 'ytmsearch',
                requester: last.info.requester,
            });
        }
        if (!res?.tracks?.length) {
            res = await client.poru.resolve({ query: `${title} ${last.info.author || ''}`.trim(), source: 'ytmsearch', requester: last.info.requester });
        }
        if (!res?.tracks?.length) return say(client, player, `${E.autoplay} Autoplay couldn't find related tracks. Use \`/play\` to add more songs!`);

        const history = (player._autoplayHistory ||= new Set());
        const seen = new Set([normalize(title)]);
        const picked = [];
        for (const t of res.tracks) {
            if (picked.length >= 6) break;
            const n = normalize(t.info?.title || '');
            if (!n || !t.info?.author || seen.has(n) || (t.info.identifier && history.has(t.info.identifier))) continue;
            picked.push(t);
            seen.add(n);
        }
        if (!picked.length) return say(client, player, `${E.autoplay} Autoplay found only duplicates. Use \`/play\` to add more songs!`);

        for (const t of picked) { t.info.requester = last.info.requester; player.queue.add(t); }
        await say(client, player, `${E.autoplay} **Autoplay Active**\n\nAdded ${picked.length} similar track${picked.length > 1 ? 's' : ''} to queue\nBased on: **${title}**`);
        if (player.isConnected && !player.isPlaying) player.play();
    } catch (e) {
        console.error('[music] autoplay error:', e);
        say(client, player, `${E.error} Autoplay encountered an error. Use \`/play\` to continue!`);
    }
}

async function handleButton(client, player, interaction) {
    return np.handle(client, player, interaction, { playPrevious });
}

/** Goes back one track (shared by the `back` command and the previous button). Returns the track or null. */
function playPrevious(client, player) {
    const state = client.guildMusicStates?.get(player.guildId);
    if (!state?.previousTracks?.length) return null;
    const previous = state.previousTracks.shift();
    if (player.currentTrack) player.queue.unshift(player.currentTrack);
    player.queue.unshift(previous);
    player._skipHistory = true; // the track we are leaving must not be pushed back into history
    player.skip();
    return previous;
}

function setup(client) {
    const poru = client.poru;
    client.guildMusicStates = client.guildMusicStates || new Map();

    poru.on('nodeConnect', (node) => {
        printInfo(`Lavalink node connected: ${node.name}`);
        stay.rejoinAll(client).catch((e) => printError(`24/7 rejoin failed: ${e.message}`));
    });
    poru.on('nodeReconnect', (node) => printInfo(`Lavalink node reconnecting: ${node.name}`));
    poru.on('nodeDisconnect', (node) => printError(`Lavalink node disconnected: ${node.name}`));
    poru.on('nodeError', (node, error) => printError(`Lavalink node error (${node.name}): ${error?.message}`));

    poru.on('trackStart', async (player, track) => {
        const channel = client.channels.cache.get(player.textChannel);
        if (!channel) return;

        // history for the previous button / back command
        const state = client.guildMusicStates.get(player.guildId) || { previousTracks: [] };
        const last = player._lastPlayedTrack;
        if (last && !player._skipHistory && state.previousTracks[0]?.info?.identifier !== last.info.identifier) {
            state.previousTracks.unshift(last);
            state.previousTracks = state.previousTracks.slice(0, HISTORY_LIMIT);
        }
        player._skipHistory = false;
        client.guildMusicStates.set(player.guildId, state);

        player._lastPlayedTrack = track;
        stay.setStatus(client, player.guildId, 'playing', player);
        (player._autoplayHistory ||= new Set());
        if (track.info?.identifier) player._autoplayHistory.add(track.info.identifier);

        if (player.nowPlayingMessage?.deletable) {
            await player.nowPlayingMessage.delete().catch(() => {});
            player.nowPlayingMessage = null;
        }
        stopCollectors(player, 'newTrack');

        try {
            const message = await channel.send(await np.payload(player, track));
            player.nowPlayingMessage = message;
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: (i) => i.message.id === message.id && i.customId.startsWith('music_'),
            });
            player.buttonCollector = collector;
            collector.on('collect', (i) => handleButton(client, player, i).catch((e) => console.error('[music] button error:', e)));
        } catch (e) {
            console.error('[music] could not send now playing message:', e);
        }
    });

    // Poru skips to the next track on its own after an error; we only tell people
    poru.on('trackError', (player, track) => {
        say(client, player, `${E.error} | couldn't play **${track?.info?.title || 'that track'}**, skipping it`);
    });

    poru.on('queueEnd', async (player) => {
        if (!player.autoplayEnabled) { stay.setStatus(client, player.guildId, 'idle', player); return disableNowPlaying(player); }
        await runAutoplay(client, player);
        if (!player.isPlaying) stay.setStatus(client, player.guildId, 'idle', player);
        return undefined;
    });

    poru.on('playerDestroy', (player) => {
        stopCollectors(player, 'destroyed');
        if (stay.isOn(player.guildId)) stay.scheduleRejoin(client, player.guildId);   // 24/7: come back
        else stay.clearStatus(client, player.voiceChannel);
        player._autoplayHistory?.clear();
        client.guildMusicStates.delete(player.guildId);
    });
}

module.exports = { setup, say, stopCollectors, playPrevious };
