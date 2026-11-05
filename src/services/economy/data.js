// grace · economy numbers and catalogues. Everything that balances the economy lives here, change it in one place.

const MIN = 60000, HOUR = 3600000, DAY = 86400000;

/** Cooldowns in ms. Premium users wait 25% less. */
const COOLDOWN = {
    daily: DAY, weekly: 7 * DAY, work: HOUR, beg: 10 * MIN, crime: 2 * HOUR, rob: 3 * HOUR,
    fish: 15 * MIN, mine: 20 * MIN, gamble: 8000, coinflip: 8000, slots: 8000,
};
const PREMIUM_CD = 0.75;

const REWARD = {
    daily: 40, dailyStep: 5, dailyMaxStreak: 10,   // 40 + 5 per day of streak, up to 10 days (90)
    weekly: 250,
    beg: [4, 18],
    crime: { win: [55, 150], fine: [40, 100], chance: 0.55 },
    rob: { chance: 0.4, take: [0.1, 0.3], cap: 400, minVictim: 100, minRobber: 50, fine: [50, 150] },
    drop: [20, 60],
};

const BANK = { interest: 0.004, premiumInterest: 0.006, premiumCap: 3000, maxDays: 30 };
const GAMBLE = { chance: 0.45, jackpotChance: 0.01, jackpot: 3, flip: 0.48, minBet: 10 };
const SHOP_LIMIT = 25;
const TRADE_FEE = 0.01;

/** Everyone starts as a cashier. Moving up takes shifts (every work command is a shift). */
const JOBS = [
    { id: 'cashier',   name: 'Cashier',     min: 14,  max: 30,  shifts: 0 },
    { id: 'barista',   name: 'Barista',     min: 20,  max: 42,  shifts: 10 },
    { id: 'courier',   name: 'Courier',     min: 28,  max: 56,  shifts: 25 },
    { id: 'cook',      name: 'Line cook',   min: 38,  max: 74,  shifts: 50 },
    { id: 'mechanic',  name: 'Mechanic',    min: 52,  max: 96,  shifts: 90 },
    { id: 'teacher',   name: 'Teacher',     min: 68,  max: 120, shifts: 150 },
    { id: 'developer', name: 'Developer',   min: 90,  max: 160, shifts: 250 },
    { id: 'doctor',    name: 'Doctor',      min: 120, max: 220, shifts: 400 },
];
const job = (id) => JOBS.find((j) => j.id === id) ?? JOBS[0];

/** The bot's own shop. Every server has it. Sell value is half the price. */
const SHOP = [
    { id: 'rod',       name: 'Fishing rod',    price: 250,  kind: 'tool',    desc: 'Lets you use `fish`. Can snap now and then.' },
    { id: 'pickaxe',   name: 'Pickaxe',        price: 400,  kind: 'tool',    desc: 'Lets you use `mine`. Can break now and then.' },
    { id: 'laptop',    name: 'Laptop',         price: 900,  kind: 'tool',    desc: '+15% pay on every `work` shift while you own it.' },
    { id: 'padlock',   name: 'Padlock',        price: 300,  kind: 'use',     desc: 'Use it to stop robberies on your wallet for 12 hours.' },
    { id: 'energy',    name: 'Energy drink',   price: 90,   kind: 'use',     desc: 'Use it to skip the wait on `work`.' },
    { id: 'clover',    name: 'Lucky clover',   price: 450,  kind: 'use',     desc: 'Use it for +15% odds on `crime` and `rob` for 6 hours.' },
    { id: 'banknote',  name: 'Bank note',      price: 1200, kind: 'use',     desc: 'Use it to raise your bank limit by 2,500.' },
];
const SELL_RATE = 0.5;

/** Weighted loot. `value` is what it sells for. */
const FISH = [
    { id: 'boot',   name: 'Old boot',     value: 1,   w: 8 },
    { id: 'minnow', name: 'Minnow',       value: 5,   w: 36 },
    { id: 'perch',  name: 'Perch',        value: 11,  w: 26 },
    { id: 'trout',  name: 'Trout',        value: 20,  w: 16 },
    { id: 'salmon', name: 'Salmon',       value: 38,  w: 8 },
    { id: 'eel',    name: 'Eel',          value: 70,  w: 4 },
    { id: 'koi',    name: 'Golden koi',   value: 160, w: 1 },
];
const ORE = [
    { id: 'stone',   name: 'Stone',     value: 3,   w: 36 },
    { id: 'coal',    name: 'Coal',      value: 8,   w: 26 },
    { id: 'copper',  name: 'Copper',    value: 14,  w: 16 },
    { id: 'iron',    name: 'Iron',      value: 24,  w: 11 },
    { id: 'gold',    name: 'Gold',      value: 60,  w: 6 },
    { id: 'diamond', name: 'Diamond',   value: 200, w: 1.5 },
];
const LOOT = [...FISH, ...ORE];
const BREAK = { rod: 0.06, pickaxe: 0.05 };

/** Pretend shares. Prices follow a smooth, repeating pattern per hour, the same in every server. */
const ASSETS = [
    { id: 'grace', name: 'Grace Corp',   base: 100, a: 0.08, p: 14.0,  ph: 0.4 },
    { id: 'moon', name: 'Moon Mining', base: 48,  a: 0.12, p: 10.0,  ph: 2.1 },
    { id: 'leaf', name: 'Leaf Foods',  base: 22,  a: 0.05, p: 20.0, ph: 4.0 },
    { id: 'gem',  name: 'Gem Labs',    base: 260, a: 0.12, p: 12.0,  ph: 5.3 },
];

const hash = (n, s) => {
    let x = (n * 374761393 + s * 668265263) | 0;
    x = (x ^ (x >>> 13)) * 1274126177 | 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
function price(asset, at = Date.now()) {
    const h = Math.floor(at / HOUR);
    const seed = asset.id.charCodeAt(0) * 31 + asset.id.charCodeAt(1);
    const v = 1 + asset.a * Math.sin(h / asset.p + asset.ph) + asset.a * 0.3 * Math.sin(h / (asset.p / 2.7) + asset.ph * 2) + 0.04 * (hash(h, seed) - 0.5);
    return Math.max(1, Math.round(asset.base * v));
}
/** Change over the last 24 hours, as a percentage. */
const change24 = (asset, at = Date.now()) => ((price(asset, at) - price(asset, at - DAY)) / price(asset, at - DAY)) * 100;
const asset = (q) => ASSETS.find((a) => a.id === String(q).toLowerCase() || a.name.toLowerCase() === String(q).toLowerCase());

/* ── helpers ───────────────────────────────────────────────────────── */

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;
function pick(list) {
    const total = list.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const x of list) { r -= x.w; if (r <= 0) return x; }
    return list[list.length - 1];
}
const n = (v) => Number(v).toLocaleString('en-US');

/** "1k", "2.5k", "1m", "1,200", "all", "half" → a whole number. `all` is `max`. Returns null when it isn't a number. */
function amount(token, max = 0) {
    const t = String(token ?? '').toLowerCase().replace(/,/g, '').trim();
    if (!t) return null;
    if (t === 'all' || t === 'max') return Math.floor(max);
    if (t === 'half') return Math.floor(max / 2);
    const m = t.match(/^(\d+(?:\.\d+)?)([km]?)$/);
    if (!m) return null;
    const v = Math.floor(parseFloat(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1));
    return Number.isFinite(v) ? v : null;
}

module.exports = {
    MIN, HOUR, DAY, COOLDOWN, PREMIUM_CD, REWARD, BANK, GAMBLE, SHOP_LIMIT, TRADE_FEE,
    JOBS, job, SHOP, SELL_RATE, FISH, ORE, LOOT, BREAK, ASSETS, price, change24, asset,
    rand, chance, pick, n, amount,
};
