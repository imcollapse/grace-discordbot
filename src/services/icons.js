// grace · custom emoji lookup. icon('verified', '✔') returns the emoji from media/emojis.json,
// or the fallback while the entry is missing or still a placeholder like <:verified:0>.

const emojis = require('../media/emojis.json');

const set = (v) => typeof v === 'string' && v.length > 0 && !/:0>$/.test(v);
const icon = (key, fallback = '') => (set(emojis[key]) ? emojis[key] : fallback);
/** Same, with a trailing space, for use in front of text. Empty when there is nothing to show. */
const pre = (key, fallback = '') => { const v = icon(key, fallback); return v ? `${v} ` : ''; };

module.exports = { icon, pre };
