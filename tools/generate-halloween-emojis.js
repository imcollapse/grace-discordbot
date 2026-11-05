// Renders the Halloween emoji art as 128x128 PNGs.
//   node tools/generate-halloween-emojis.js [outDir]      (default: ./tempassets)
// Start the bot afterwards: emojiSync uploads every PNG as an application emoji and
// rewrites the `hw_*` ids in src/media/emojis.json. Until then the unicode fallback is used.

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const U = require('../src/services/halloween/art/util');
const { drawIcon } = require('../src/services/halloween/art/icons');

const RARITY = { common: '#9ca3af', rare: '#38bdf8', epic: '#a855f7', legendary: '#fb923c' };

// emoji name → [icon, options]
const MAP = {
    hw_candy: ['candy'], hw_candycorn: ['candycorn'], hw_pumpkin: ['pumpkin'], hw_ghost: ['ghost'], hw_bat: ['bat'],
    hw_skull: ['skull'], hw_spider: ['spider'], hw_web: ['web'], hw_moon: ['moon'], hw_house: ['house'], hw_tomb: ['tomb'],
    hw_cat: ['cat'], hw_cauldron: ['cauldron'], hw_crown: ['crown'], hw_streak: ['flame'], hw_ticket: ['ticket'],
    hw_lock: ['lock'], hw_check: ['check'], hw_crate: ['crate', { kind: 'haunted' }], hw_cursed_crate: ['crate', { kind: 'cursed' }],
    hw_badge: ['crown'], hw_title: ['tag'], hw_frame: ['frame'], hw_accent: ['drop'], hw_theme: ['picture'],
    ...Object.fromEntries(Object.entries(RARITY).map(([r, c]) => [`hw_gem_${r}`, ['gem', { color: c }]])),
};

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'tempassets'));
fs.mkdirSync(out, { recursive: true });
U.registerFonts();
for (const [name, [icon, opts]] of Object.entries(MAP)) {
    const c = createCanvas(128, 128);
    drawIcon(c.getContext('2d'), icon, 64, 64, 112, opts || {});
    fs.writeFileSync(path.join(out, `${name}.png`), c.toBuffer('image/png'));
}
console.log(`Wrote ${Object.keys(MAP).length} emoji PNGs to ${out}`);
