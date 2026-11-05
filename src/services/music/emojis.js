/*
 * grace · music · emoji resolver
 *
 * Every music icon is read from media/emojis.json under `music_<name>` (page arrows, tick, cross and bin use the
 * shared ones). A missing key resolves to an empty string, so no extra emoji is ever invented.
 */

const base = require('../../media/emojis.json');

const pick = (key) => (typeof base[key] === 'string' ? base[key] : '');

const E = {
    note: pick('music_note'),
    play: pick('music_play'),
    pause: pick('music_pause'),
    skip: pick('music_skip'),
    previous: pick('music_previous'),
    rewind: pick('music_previous'),
    stop: pick('music_stop'),
    loop: pick('music_loop'),
    shuffle: pick('music_shuffle'),
    queue: pick('music_queue'),
    volume: pick('music_volume'),
    heart: pick('music_like'),
    trash: pick('music_remove'),
    filter: pick('music_filter'),
    lyrics: pick('music_lyrics'),
    autoplay: pick('music_autoplay'),
    move: pick('music_move'),
    seek: pick('music_seek'),
    playlist: pick('music_playlist'),
    home: pick('music_home'),
    success: pick('success'),
    error: pick('error'),
    prevPage: pick('arrow_left'),
    nextPage: pick('arrow_right'),
    delete: pick('delete'),
};

module.exports = E;
