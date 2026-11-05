/*
 * grace · music
 * Lavalink (Poru) music system, ported from AeroX Music.
 *
 *   require('./services/music').init(client)   // before login
 *   require('./services/music').start(client)  // once the client is ready
 *
 * Without LAVALINK_HOSTS (or without the `poru` package) the bot still boots,
 * music commands simply answer that music isn't set up.
 */

const config = require('../../settings');
const { printInfo, printError, printSuccess } = require('../consoleLogger');

function parseNodes() {
    const split = (v) => String(v || '').split(',').map((s) => s.trim());
    const hosts = split(config.LAVALINK.HOSTS).filter(Boolean);
    const ports = split(config.LAVALINK.PORTS);
    const passwords = split(config.LAVALINK.PASSWORDS);
    const secures = split(config.LAVALINK.SECURES);
    return hosts.map((host, i) => ({
        name: `Node-${i + 1}`,
        host,
        port: parseInt(ports[i] ?? ports[0], 10) || 2333,
        password: passwords[i] ?? passwords[0] ?? 'youshallnotpass',
        secure: (secures[i] ?? secures[0]) === 'true',
    }));
}

function init(client) {
    client.poru = null;
    client.guildMusicStates = new Map();

    const nodes = parseNodes();
    if (!nodes.length) { printInfo('Music disabled — set LAVALINK_HOSTS in .env to enable it'); return; }

    let Poru;
    try { ({ Poru } = require('poru')); } catch (e) {
        printError('Music disabled — the "poru" package is not installed (npm install)');
        return;
    }

    client.poru = new Poru(client, nodes, {
        library: 'discord.js',
        defaultPlatform: config.MUSIC.DEFAULT_PLATFORM,
        resumeKey: 'hopeMusic',
        resumeTimeout: 60,
        reconnectTimeout: 10000,
        reconnectTries: 5,
    });

    // Searches go to the default platform (Spotify). When it finds nothing, or the node has no Spotify
    // support, the same search is retried on YouTube so people still get a result.
    const FALLBACK = 'ytsearch';
    const resolve = client.poru.resolve.bind(client.poru);
    client.poru.resolve = async (opts = {}) => {
        const wanted = opts.source || config.MUSIC.DEFAULT_PLATFORM;
        const isSearch = !/^https?:\/\//i.test(String(opts.query || '')) && wanted !== FALLBACK;
        let res = null;
        try { res = await resolve(opts); } catch (e) { if (!isSearch) throw e; }
        const bad = !res || res.loadType === 'empty' || res.loadType === 'error' || !res.tracks?.length;
        if (isSearch && bad) {
            try { const alt = await resolve({ ...opts, source: FALLBACK }); if (alt?.tracks?.length) return alt; } catch { /* keep the first result */ }
        }
        return res;
    };
    require('./events').setup(client);
}

function start(client) {
    if (!client.poru) return;
    try {
        // load the 24/7 channels first, so they are rejoined as soon as a lavalink node connects
        require('./stay').load().catch((e) => printError(`24/7 list failed to load: ${e.message}`)).finally(() => client.poru?.init(client));
        printSuccess(`Music system ready (${client.poru.nodes.size} lavalink node${client.poru.nodes.size === 1 ? '' : 's'})`);
    } catch (e) {
        printError(`Music system failed to start: ${e.message}`);
        client.poru = null;
    }
}

module.exports = { init, start };
