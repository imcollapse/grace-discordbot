/* grace · music · lyrics lookup: lrclib -> lyrics.ovh -> Genius (optional) */

const config = require('../../settings');

function cleanQuery(track) {
    const original = track.info.title || '';
    let artist; let title;
    const sep = ['-', '–', '|'].find((s) => original.includes(s));
    if (sep) {
        const parts = original.split(sep);
        artist = parts[0].trim();
        title = parts.slice(1).join(' ').trim();
    } else {
        artist = track.info.author || '';
        title = original;
    }
    const junk = /official|lyric|video|audio|\bmv\b|\bhd\b|\bhq\b|\bft\b|feat/gi;
    artist = artist.replace(junk, '').replace(/ - topic$/i, '').trim();
    title = title.replace(junk, '').replace(/\(.*?\)|\[.*?\]/g, '').trim();
    return { artist, title, original };
}

async function getJson(url, ms = 8000) {
    const res = await fetch(url, { headers: { 'User-Agent': 'grace-music-bot' }, signal: AbortSignal.timeout(ms) });
    return res.ok ? res.json() : null;
}

/** -> { lyrics, artist, title, source } | null */
async function findLyrics(track) {
    const { artist, title, original } = cleanQuery(track);

    try {
        const p = new URLSearchParams();
        if (title) p.set('track_name', title); else p.set('q', original);
        if (artist) p.set('artist_name', artist);
        const list = await getJson(`https://lrclib.net/api/search?${p}`);
        if (Array.isArray(list) && list.length) {
            const hit = list.find((r) => r.trackName?.toLowerCase().includes(title.toLowerCase()) && r.artistName?.toLowerCase().includes(artist.toLowerCase())) || list[0];
            const lyrics = hit.plainLyrics || hit.syncedLyrics;
            if (lyrics) return { lyrics, artist: hit.artistName || artist, title: hit.trackName || title, source: 'lrclib.net' };
        }
    } catch (e) { console.error('[lyrics] lrclib failed:', e.message); }

    if (artist && title) {
        try {
            const data = await getJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
            if (data?.lyrics) return { lyrics: data.lyrics, artist, title, source: 'lyrics.ovh' };
        } catch (e) { console.error('[lyrics] lyrics.ovh failed:', e.message); }
    }

    if (config.GENIUS?.API_KEY) {
        try {
            const Genius = require('genius-lyrics');
            const client = new Genius.Client(config.GENIUS.API_KEY);
            const [song] = await client.songs.search(`${artist} ${title}`.trim());
            const lyrics = song && await song.lyrics();
            if (lyrics) return { lyrics, artist: song.artist.name, title: song.title, source: 'genius.com' };
        } catch (e) { console.error('[lyrics] genius failed:', e.message); }
    }
    return null;
}

module.exports = { findLyrics };
