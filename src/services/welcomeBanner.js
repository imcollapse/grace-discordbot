/* grace — generated banner images ("you're the 194th member") for welcome, embeds and containers.
   Users just write a variable such as {banner} or {banner.red} as an image link; the bot draws the
   picture at send time and attaches it. */

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const U = require('./cardArt');
const K = require('./cardKit');

const W = 1400, H = 240;

// theme -> [tint, deep, accent]; "auto" picks a theme from the avatar's own colours
const THEMES = {
    red:    ['#d64550', '#120607', '#ff7a85'],
    blue:   ['#3f78e0', '#050a14', '#7aa8ff'],
    purple: ['#7d5fe0', '#0b0716', '#b399ff'],
    green:  ['#2fae72', '#040d09', '#6fe0a6'],
    gold:   ['#d99a2b', '#120c03', '#ffc860'],
    pink:   ['#e0558f', '#14060d', '#ff8fbc'],
    dark:   ['#4a4d57', '#060607', '#c4c7d0'],
};
const THEME_NAMES = Object.keys(THEMES);
const KINDS = { m: 'member', b: 'bye' };

const ordinal = (n) => {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};

/** The file name a variable turns into. It carries everything needed to draw the image later. */
function token({ theme = 'auto', kind = 'm', guildId, userId, count }) {
    if (!guildId || !userId) return '';
    return `attachment://hwb_${theme}_${kind}_${guildId}_${userId}_${Math.max(0, Math.floor(count) || 0)}.png`;
}

const TOKEN_RE = /attachment:\/\/(hwb_([a-z]+)_([mb])_(\d{15,25})_(\d{15,25})_(\d{1,9})\.png)/gi;

function autoTheme(userId) {
    return THEME_NAMES[U.hashString(String(userId)) % THEME_NAMES.length];
}

async function render({ theme, kind, user, guild, count }) {
    U.registerFonts();
    if (!THEMES[theme]) theme = autoTheme(user.id);
    const [tint, deep, accent] = THEMES[theme];
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // 1. page: theme gradient, the avatar as a very soft wash, hairline frame
    K.page(ctx, W, H, { top: U.mix(deep, tint, 0.14), bottom: deep, tagLeft: kind === 'b' ? 'grace / farewell' : 'grace / welcome', tagRight: 'grace', radius: 26 });
    let avatar = null;
    try {
        avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }));
        const tiny = createCanvas(16, 16);
        tiny.getContext('2d').drawImage(avatar, 0, 0, 16, 16);
        const mid = createCanvas(128, 128), m = mid.getContext('2d');
        m.imageSmoothingEnabled = true; m.imageSmoothingQuality = 'high';
        m.drawImage(tiny, 0, 0, 128, 128);
        ctx.save(); ctx.globalAlpha = 0.14; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(mid, 0, -(W - H) / 2, W, W); ctx.restore();
    } catch { /* no avatar: the theme colours alone are fine */ }

    // 2. arched portrait on the left
    const bye = kind === 'b';
    K.archPortrait(ctx, avatar, 66, 34, 118, 172, { label: user.username || '?', ring: accent, fill: U.mix(deep, tint, 0.3), frameGap: 8 });

    // 3. words
    const X = 246;
    K.label(ctx, bye ? 'farewell' : 'welcome', X, 76, { color: accent, size: 17, spacing: 7 });
    U.text(ctx, `${ordinal(count)} member`, X, 154, { font: U.FONT.serif, size: 80, color: '#f6f3ee', maxWidth: 700 });
    const who = user.globalName || user.displayName || user.username || '';
    U.text(ctx, bye ? `${who} has left` : who, X, 198, { font: U.FONT.regular, size: 25, color: U.rgba('#f6f3ee', 0.6), maxWidth: 700 });

    // 4. the date on the right
    K.hairline(ctx, 1030, 42, 1030, H - 42, U.rgba(accent, 0.3));
    const cx = 1030 + (W - 24 - 1030) / 2;
    const now = new Date();
    K.label(ctx, bye ? 'left on' : 'joined on', cx, 76, { color: U.rgba('#f6f3ee', 0.5), size: 15, spacing: 5, align: 'center' });
    U.text(ctx, String(now.getDate()), cx, 160, { font: U.FONT.serif, size: 84, color: accent, align: 'center' });
    K.label(ctx, now.toLocaleDateString('en', { month: 'short', year: 'numeric' }), cx, 200, { color: U.rgba('#f6f3ee', 0.5), size: 14, spacing: 4, align: 'center' });

    U.finish(ctx, W, H, { vignetteStrength: 0.2, grainAmount: 0.045 });

    // 5. rounded outer edge
    const out = createCanvas(W, H), o = out.getContext('2d');
    U.rr(o, 0, 0, W, H, 36); o.clip(); o.drawImage(canvas, 0, 0);
    return out.toBuffer('image/png');
}

const cache = new Map();   // file name -> { buf, at }
const TTL = 10 * 60 * 1000;
async function pictureFor(name, theme, kind, userId, guildId, count, client) {
    const hit = cache.get(name);
    if (hit && Date.now() - hit.at < TTL) return hit.buf;
    const user = await client.users.fetch(userId);
    const guild = client.guilds.cache.get(guildId);
    const buf = await render({ theme, kind, user, guild, count });
    cache.set(name, { buf, at: Date.now() });
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    return buf;
}

/** True when an outgoing message links to a banner picture. */
function wants(options) {
    if (!options || typeof options !== 'object') return false;
    try { return JSON.stringify({ c: options.content, k: options.components, e: options.embeds }).includes('attachment://hwb_'); } catch { return false; }
}

/** Find banner links in an outgoing message and attach the pictures they point to. */
async function attach(options, client, edits = false) {
    if (!options || typeof options !== 'object') return options;
    let json;
    try { json = JSON.stringify({ c: options.content, k: options.components, e: options.embeds }); } catch { return options; }
    if (!json || !json.includes('attachment://hwb_')) return options;

    const have = new Set((options.files ?? []).map(f => f?.name ?? f?.attachment?.name).filter(Boolean));
    const files = [];
    for (const m of new Set(json.match(TOKEN_RE) ?? [])) {
        const [, name, theme, kind, guildId, userId, count] = new RegExp(TOKEN_RE.source, 'i').exec(m);
        if (have.has(name)) continue;
        try {
            const buf = await pictureFor(name, theme.toLowerCase(), kind.toLowerCase(), userId, guildId, Number(count), client);
            files.push(new AttachmentBuilder(buf, { name }));
        } catch (e) { console.error('[banner] could not draw', name, e.stack || e.message); }
    }
    return files.length ? { ...options, files: [...(options.files ?? []), ...files], ...(edits ? { attachments: [] } : {}) } : options;
}

const METHODS = {
    send: ['TextChannel', 'NewsChannel', 'VoiceChannel', 'StageChannel', 'ThreadChannel', 'DMChannel', 'User', 'GuildMember'],
    reply: ['Message', 'CommandInteraction', 'MessageComponentInteraction', 'ModalSubmitInteraction'],
    edit: ['Message'],
    editReply: ['CommandInteraction', 'MessageComponentInteraction', 'ModalSubmitInteraction'],
    followUp: ['CommandInteraction', 'MessageComponentInteraction', 'ModalSubmitInteraction'],
    update: ['MessageComponentInteraction', 'ModalSubmitInteraction'],
};

/** Wrap discord.js send methods once so every path (welcome, embeds, containers, DMs) gets banners. */
function install() {
    const D = require('discord.js');
    for (const [method, classes] of Object.entries(METHODS)) {
        for (const cls of classes) {
            const proto = D[cls]?.prototype;
            const orig = proto && Object.getOwnPropertyDescriptor(proto, method)?.value;
            if (typeof orig !== 'function' || orig.__banner) continue;
            const isEdit = method === 'edit' || method === 'editReply' || method === 'update';
            const wrapped = async function (options, ...rest) {
                try {
                    const client = this.client ?? this.channel?.client;
                    if (wants(options)) {
                        // An interaction must be answered within 3 seconds and drawing can take longer,
                        // so acknowledge first and put the finished message in with editReply.
                        const first = typeof this.deferReply === 'function' && !this.deferred && !this.replied;
                        if (first && (method === 'reply' || method === 'update')) {
                            const eph = ((options.flags ?? 0) & 64) ? { flags: 64 } : {};
                            if (method === 'update' && typeof this.deferUpdate === 'function') await this.deferUpdate();
                            else await this.deferReply(eph);
                            const body = await attach(options, client, true);
                            const { withResponse, ...clean } = body;
                            return this.editReply(clean);
                        }
                        options = await attach(options, client, isEdit);
                    }
                } catch (e) { console.error('[banner]', e.stack || e.message); }
                return orig.call(this, options, ...rest);
            };
            wrapped.__banner = true;
            Object.defineProperty(proto, method, { value: wrapped, writable: true, configurable: true });
        }
    }
}

/** {banner} variables, built from the usual variable context. */
function variables() {
    const make = (theme, kind, desc) => [desc, (c) => token({ theme, kind, guildId: c.guild?.id, userId: c.user?.id, count: c.guild?.memberCount })];
    const out = { 'banner': make('auto', 'm', 'Picture: "you\'re the 194th member" (colour from their avatar). Use as an image link') };
    for (const t of THEME_NAMES) out[`banner.${t}`] = make(t, 'm', `Same picture in ${t}`);
    out['banner.bye'] = make('auto', 'b', 'Goodbye picture for farewells');
    return out;
}

module.exports = { install, variables, attach, render, token, THEME_NAMES };
