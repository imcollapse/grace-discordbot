// grace · small personal tools. They need no server, so they work in DMs and anywhere else.
// Each one is a prefix command: modules/text/me/<name>.js calls build('<name>').

const crypto = require('crypto');
const ms = require('ms');
const ui = require('../ui');
const { pre } = require('../icons');

const NOMENTION = { allowedMentions: { parse: [], repliedUser: false } };
const reply = (m, e) => ui.sendEmbed(m, e, { extra: NOMENTION });
const E = (description, kind = 'base', extra = {}) => ui.embed({ kind, description, ...extra });
const bad = (m, text, hint) => reply(m, E(`${text}${hint ? `\n-# ${hint}` : ''}`, 'error'));

async function getJson(url, text = false) {
    const res = await fetch(url, { headers: { 'user-agent': 'grace-bot/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return text ? JSON.parse(await res.text()) : res.json();
}
const clean = (s) => String(s).replace(/@(everyone|here)/g, '@​$1').replace(/<@/g, '<@​');

const H = {};

H.choose = async (m, a) => {
    const opts = a.join(' ').split(/\s*[|,]\s*/).map((x) => x.trim()).filter(Boolean);
    if (opts.length < 2) return bad(m, 'give me at least two options.', 'Example: `choose pizza | burgers | sushi`');
    return reply(m, E(`**I pick** ${clean(opts[crypto.randomInt(opts.length)])}\n-# out of ${opts.length} options`));
};

H.roll = async (m, a) => {
    const t = (a[0] || '1d6').toLowerCase();
    const x = t.match(/^(\d{0,3})d(\d{1,4})$/);
    if (!x) return bad(m, 'that isn\'t a dice roll.', 'Example: `roll 2d6` or `roll d20`');
    const count = Math.max(1, Math.min(100, Number(x[1] || 1))), sides = Math.max(2, Number(x[2]));
    const rolls = Array.from({ length: count }, () => crypto.randomInt(1, sides + 1));
    return reply(m, E(`**you rolled ${rolls.reduce((s, v) => s + v, 0)}**\n> ${rolls.slice(0, 30).join(', ')}${rolls.length > 30 ? ', ...' : ''}\n-# ${count}d${sides}`));
};

const BALL = ['It is certain.', 'Without a doubt.', 'Yes, definitely.', 'Most likely.', 'Looks good.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Don\'t count on it.', 'My sources say no.', 'Very doubtful.', 'Outlook not so good.'];
H.eightball = async (m, a) => {
    if (!a.length) return bad(m, 'ask a question first.', 'Example: `8ball will it rain today`');
    return reply(m, E(`**${clean(a.join(' ')).slice(0, 200)}**\n> ${BALL[crypto.randomInt(BALL.length)]}`));
};

H.timestamp = async (m, a) => {
    const raw = a.join(' ').trim();
    let at = null;
    if (!raw || raw === 'now') at = Date.now();
    else if (/^\d{9,11}$/.test(raw)) at = Number(raw) * 1000;
    else if (/^\d{12,13}$/.test(raw)) at = Number(raw);
    else if (/^[+-]?\s*\d+(\.\d+)?\s*[smhdwy]/i.test(raw)) { const v = ms(raw.replace(/^\+/, '').replace(/\s+/g, '')); if (v) at = Date.now() + v; }
    else { const d = Date.parse(raw); if (!Number.isNaN(d)) at = d; }
    if (at === null) return bad(m, 'I couldn\'t read that time.', 'Try `timestamp 2h`, `timestamp 2026-12-25 18:00` or a unix number');
    const s = Math.floor(at / 1000);
    const lines = [['t', 'short time'], ['T', 'long time'], ['d', 'short date'], ['D', 'long date'], ['f', 'date and time'], ['F', 'full date'], ['R', 'relative']]
        .map(([f, name]) => `> <t:${s}:${f}> · \`<t:${s}:${f}>\` -# ${name}`.replace(' -# ', ' · '));
    return reply(m, E([`**timestamps** for <t:${s}:F>`, ...lines].join('\n')));
};

function parseColor(t) {
    t = t.trim().toLowerCase();
    let x = t.match(/^#?([0-9a-f]{6})$/); if (x) return parseInt(x[1], 16);
    x = t.match(/^#?([0-9a-f]{3})$/); if (x) return parseInt([...x[1]].map((c) => c + c).join(''), 16);
    x = t.match(/^(?:rgb\()?\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\)?$/);
    if (x && [1, 2, 3].every((i) => Number(x[i]) <= 255)) return (Number(x[1]) << 16) | (Number(x[2]) << 8) | Number(x[3]);
    return null;
}
H.color = async (m, a) => {
    const v = a.length ? parseColor(a.join(' ')) : crypto.randomInt(0x1000000);
    if (v === null) return bad(m, 'that isn\'t a colour.', 'Try `color #ff8800`, `color 255 136 0` or just `color` for a random one');
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d) {
        s = d / (1 - Math.abs(2 * l - 1));
        const R = r / 255, G = g / 255, B = b / 255;
        h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    const hex = v.toString(16).padStart(6, '0');
    const e = ui.embed({
        description: [`**#${hex}**`, `> hex · \`#${hex}\``, `> rgb · \`${r}, ${g}, ${b}\``, `> hsl · \`${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%\``, `> number · \`${v}\``].join('\n'),
        thumbnail: `https://singlecolorimage.com/get/${hex}/120x120`,
    });
    e.setColor(v);
    return reply(m, e);
};

H.password = async (m, a) => {
    const len = Math.max(8, Math.min(64, parseInt(a[0], 10) || 16));
    const set = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_?';
    const pw = Array.from({ length: len }, () => set[crypto.randomInt(set.length)]).join('');
    return reply(m, E(`**your password**\n\`\`\`${pw}\`\`\`-# ${len} characters · make it in DMs so nobody else sees it`));
};

H.qr = async (m, a) => {
    const data = a.join(' ').trim();
    if (!data) return bad(m, 'give me something to encode.', 'Example: `qr https://discord.com`');
    if (data.length > 900) return bad(m, 'that is too long for a QR code.');
    return reply(m, E(`**qr code**\n-# ${clean(data).slice(0, 100)}`, 'base', { image: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(data)}` }));
};

const WMO = { 0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'heavy freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'rain showers', 81: 'rain showers', 82: 'violent showers', 85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail' };
H.weather = async (m, a) => {
    const q = a.join(' ').trim();
    if (!q) return bad(m, 'tell me a city.', 'Example: `weather mumbai`');
    try {
        const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en`);
        const p = geo.results?.[0];
        if (!p) return bad(m, `I couldn't find **${clean(q).slice(0, 60)}**.`);
        const w = (await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`)).current;
        const f = (c) => Math.round(c * 9 / 5 + 32);
        return reply(m, E([
            `**${[p.name, p.admin1, p.country].filter(Boolean).join(', ')}**`,
            `> ${WMO[w.weather_code] ?? 'unknown'}`,
            `> temperature · **${Math.round(w.temperature_2m)}°C** / ${f(w.temperature_2m)}°F`,
            `> feels like · **${Math.round(w.apparent_temperature)}°C**`,
            `> humidity · **${w.relative_humidity_2m}%** · wind · **${Math.round(w.wind_speed_10m)} km/h**`,
            '-# data from open-meteo',
        ].join('\n')));
    } catch { return bad(m, 'the weather service didn\'t answer, try again in a moment.'); }
};

const CITY = { india: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', delhi: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', bangalore: 'Asia/Kolkata', chennai: 'Asia/Kolkata',
    newyork: 'America/New_York', nyc: 'America/New_York', la: 'America/Los_Angeles', losangeles: 'America/Los_Angeles', sanfrancisco: 'America/Los_Angeles', chicago: 'America/Chicago',
    toronto: 'America/Toronto', mexicocity: 'America/Mexico_City', saopaulo: 'America/Sao_Paulo', london: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin',
    madrid: 'Europe/Madrid', rome: 'Europe/Rome', istanbul: 'Europe/Istanbul', moscow: 'Europe/Moscow', dubai: 'Asia/Dubai', singapore: 'Asia/Singapore',
    hongkong: 'Asia/Hong_Kong', beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', seoul: 'Asia/Seoul', tokyo: 'Asia/Tokyo', karachi: 'Asia/Karachi', dhaka: 'Asia/Dhaka',
    jakarta: 'Asia/Jakarta', manila: 'Asia/Manila', sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', auckland: 'Pacific/Auckland', cairo: 'Africa/Cairo',
    lagos: 'Africa/Lagos', johannesburg: 'Africa/Johannesburg', nairobi: 'Africa/Nairobi', utc: 'UTC' };
H.worldtime = async (m, a) => {
    const q = a.join(' ').trim().toLowerCase().replace(/\s+/g, '_');
    if (!q) return bad(m, 'give me a city or timezone.', 'Example: `time tokyo` or `time Asia/Kolkata`');
    const zones = Intl.supportedValuesOf('timeZone');
    const zone = CITY[q.replace(/_/g, '')] || zones.find((z) => z.toLowerCase() === q) || zones.find((z) => z.toLowerCase().split('/').pop() === q) || zones.find((z) => z.toLowerCase().includes(q));
    if (!zone) return bad(m, 'I don\'t know that place.', 'Use a big city or a timezone like `Europe/London`');
    const now = new Date();
    const fmt = (o) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...o }).format(now);
    return reply(m, E([`**${zone.replace(/_/g, ' ')}**`, `> **${fmt({ hour: '2-digit', minute: '2-digit', hour12: false })}** · ${fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`, `-# ${fmt({ timeZoneName: 'long' }).split(', ').pop()}`].join('\n')));
};

H.reverse = async (m, a) => {
    if (!a.length) return bad(m, 'give me text to reverse.');
    return reply(m, E(`> ${clean([...a.join(' ')].reverse().join('')).slice(0, 1800)}`));
};

H.base64 = async (m, a) => {
    const mode = (a[0] || '').toLowerCase();
    const text = a.slice(1).join(' ');
    if (!['encode', 'decode'].includes(mode) || !text) return bad(m, 'say encode or decode, then the text.', 'Example: `base64 encode hello`');
    const out = mode === 'encode' ? Buffer.from(text).toString('base64') : Buffer.from(text, 'base64').toString('utf8');
    return reply(m, E(`**${mode}d**\n\`\`\`${clean(out).replace(/`/g, '\'').slice(0, 1800)}\`\`\``));
};

H.joke = async (m) => {
    try { const j = await getJson('https://official-joke-api.appspot.com/random_joke'); return reply(m, E(`**${clean(j.setup)}**\n> ${clean(j.punchline)}`)); }
    catch { return bad(m, 'I couldn\'t fetch a joke right now.'); }
};
H.advice = async (m) => {
    try { const j = await getJson('https://api.adviceslip.com/advice', true); return reply(m, E(`**advice**\n> ${clean(j.slip.advice)}`)); }
    catch { return bad(m, 'I couldn\'t fetch advice right now.'); }
};
H.fact = async (m) => {
    try { const j = await getJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en'); return reply(m, E(`**did you know**\n> ${clean(j.text)}`)); }
    catch { return bad(m, 'I couldn\'t fetch a fact right now.'); }
};

H.currency = async (m, a) => {
    const amount = parseFloat(a[0]);
    const from = (a[1] || '').toUpperCase(), to = (a[a[2] && a[2].toLowerCase() === 'to' ? 3 : 2] || '').toUpperCase();
    if (!(amount > 0) || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return bad(m, 'tell me an amount and two currencies.', 'Example: `currency 100 usd inr`');
    try {
        const r = await getJson(`https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`);
        const v = r.rates?.[to];
        if (v === undefined) throw new Error('none');
        return reply(m, E(`**${amount.toLocaleString('en-US')} ${from}**\n> ${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} **${to}**\n-# rates from ${r.date}`));
    } catch { return bad(m, 'I couldn\'t convert that.', 'Check the currency codes, like `usd`, `eur`, `inr`.'); }
};

H.snowflake = async (m, a) => {
    const id = (a[0] || '').replace(/\D/g, '');
    if (id.length < 15 || id.length > 20) return bad(m, 'give me a Discord ID.', 'Example: `snowflake 123456789012345678`');
    const t = Number((BigInt(id) >> 22n) + 1420070400000n);
    return reply(m, E(`**${id}**\n> made <t:${Math.floor(t / 1000)}:F> · <t:${Math.floor(t / 1000)}:R>`));
};

const META = {
    choose:    { aliases: ['pick'],           description: 'Pick one of the options for you', usage: 'choose <a> | <b> | <c>' },
    roll:      { aliases: ['dice'],           description: 'Roll dice like 2d6 or d20', usage: 'roll [2d6]' },
    eightball: { aliases: ['8ball'],          description: 'Ask the magic 8 ball', usage: '8ball <question>' },
    timestamp: { aliases: ['ts'],             description: 'Make Discord timestamps from a time like 2h or 2026-12-25 18:00', usage: 'timestamp <time>' },
    color:     { aliases: ['colour'],         description: 'Show a colour as hex, rgb and hsl', usage: 'color [#hex|r g b]' },
    password:  { aliases: ['pass'],           description: 'Make a strong random password', usage: 'password [length]' },
    qr:        { aliases: [],                 description: 'Turn text or a link into a QR code', usage: 'qr <text>' },
    weather:   { aliases: [],              description: 'Current weather for a city', usage: 'weather <city>' },
    worldtime: { aliases: ['tz', 'timein'],   description: 'The time in a city or timezone', usage: 'tz <city>' },
    reverse:   { aliases: [],                 description: 'Reverse some text', usage: 'reverse <text>' },
    base64:    { aliases: ['b64'],            description: 'Encode or decode base64', usage: 'base64 <encode|decode> <text>' },
    joke:      { aliases: [],                 description: 'A random joke', usage: 'joke' },
    advice:    { aliases: [],                 description: 'A random piece of advice', usage: 'advice' },
    fact:      { aliases: [],                 description: 'A random fact', usage: 'fact' },
    currency:  { aliases: ['cur', 'exchange'], description: 'Convert money between currencies', usage: 'currency <amount> <from> <to>' },
    snowflake: { aliases: ['sf'],             description: 'See when a Discord ID was created', usage: 'snowflake <id>' },
};

function build(name) {
    const meta = META[name];
    return {
        name, aliases: meta.aliases, description: meta.description, usage: meta.usage, category: 'tools', dm: true,
        async execute(message, args = []) {
            try { await H[name](message, args); }
            catch (err) { console.error(`[tools] ${name}:`, err.message); reply(message, E('Something went wrong with that command.', 'error')).catch(() => {}); }
        },
    };
}

module.exports = { build, META, H };
