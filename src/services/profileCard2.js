// grace · member profile card. Banner on top, round avatar, name, tagline, short description and three details
// (location, age, profession). Everything on it is the member's own: text, banner picture and theme.

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const U = require('./cardArt');
const K = require('./cardKit');

const W = 900, H = 690;

/** Themes: one soft, flat colour each. Light ones carry dark text, dark ones carry light text. */
const tone = (base, dark) => ({
    top: dark ? U.mix(base, '#ffffff', 0.1) : U.mix(base, '#ffffff', 0.4),
    bottom: dark ? U.mix(base, '#000000', 0.5) : U.mix(base, '#000000', 0.1),
    base, dark,
    accent: dark ? U.mix(base, '#ffffff', 0.62) : U.mix(base, '#000000', 0.58),
    fg: dark ? '#f6f4f0' : '#1c1a20',
    muted: dark ? U.mix(base, '#ffffff', 0.66) : U.mix(base, '#000000', 0.5),
});
const THEMES = {
    lavender: { name: 'Lavender', ...tone('#e6dafe', false) },
    blush:    { name: 'Blush',    ...tone('#feb7c9', false) },
    sage:     { name: 'Sage',     ...tone('#cfdfc2', false) },
    sky:      { name: 'Sky',      ...tone('#cfe2f6', false) },
    butter:   { name: 'Butter',   ...tone('#f6e8b8', false) },
    peach:    { name: 'Peach',    ...tone('#fcd3bc', false) },
    forest:   { name: 'Forest',   ...tone('#304429', true) },
    plum:     { name: 'Plum',     ...tone('#4b2f52', true) },
    navy:     { name: 'Navy',     ...tone('#1f2a44', true) },
    ink:      { name: 'Ink',      ...tone('#111113', true) },
};
const LEGACY = { dusk: 'lavender', violet: 'lavender', moss: 'forest', clay: 'peach', sunset: 'peach', slate: 'navy', ocean: 'sky', rose: 'blush', crimson: 'blush', midnight: 'navy', paper: 'butter' };
const themeKey = (k) => (THEMES[k] ? k : LEGACY[k] ?? 'ink');

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
/** "#abc" / "abc" / "AABBCC" -> "#aabbcc", or null when it isn't a colour. */
function parseHex(input) {
    const m = HEX.exec(String(input ?? '').trim());
    if (!m) return null;
    let h = m[1].toLowerCase();
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return `#${h}`;
}
const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The theme to draw with: a member's own hex colour if they set one, otherwise their chosen theme. */
function resolveTheme(card = {}) {
    const hex = parseHex(card.color);
    if (!hex) return THEMES[themeKey(card.theme)];
    return { name: 'Custom', ...tone(hex, luminance(hex) < 0.36) };
}

const STATUS = { online: '#3ec47c', idle: '#f0b232', dnd: '#ef5760', streaming: '#9b7bf0', offline: '#80848e' };

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Word-wrap into at most `max` lines; the last line gets an ellipsis when text is left over. */
function wrap(ctx, str, width, max) {
    const words = String(str).split(' ');
    const lines = []; let line = '';
    for (let i = 0; i < words.length; i++) {
        const test = line ? `${line} ${words[i]}` : words[i];
        if (ctx.measureText(test).width <= width || !line) { line = test; continue; }
        lines.push(line); line = words[i];
        if (lines.length === max) { line = ''; lines[max - 1] = `${lines[max - 1]}…`; break; }
    }
    if (line) lines.push(line);
    if (lines.length > max) lines.length = max;
    return lines.map((l) => { let t = l; while (t.length > 1 && ctx.measureText(t).width > width) t = t.slice(0, -2) + '…'; return t; });
}

async function tryLoad(src) {
    if (!src) return null;
    try { return await loadImage(src); } catch { return null; }
}

/**
 * @param {object} o
 *  user    { name, handle, avatar (url|Buffer|null), bot }
 *  status  online|idle|dnd|offline|streaming
 *  card    { theme, tagline, bio, location, age, profession }
 *  banner  Buffer | url | null
 *  socials [{ platform }]
 *  badges  [Image]   clan  string | null
 */
async function renderProfile(o) {
    U.registerFonts();
    const card = o.card ?? {};
    const T = resolveTheme(card);
    const accent = T.accent, fg = T.fg, muted = T.muted;
    const ink = T.dark ? '#ffffff' : '#000000';

    const [avatar, banner] = await Promise.all([tryLoad(o.user.avatar), tryLoad(o.banner)]);
    // no banner picture: the card is shorter, so there is no empty band at the top
    const cut = banner ? 0 : 100;
    const canvas = createCanvas(W, H - cut);
    const ctx = canvas.getContext('2d');

    // page: tinted fade with a little of the avatar blurred underneath, corner brackets, two small tags
    const socials = (o.socials ?? []).slice(0, 3).map((s) => s.platform);
    ctx.save();
    U.rr(ctx, 0, 0, W, H - cut, 30); ctx.clip();
    K.page(ctx, W, H - cut, { top: T.top, bottom: T.bottom, art: banner ? null : avatar, light: !T.dark, tagLeft: 'grace / profile', tagRight: socials.length ? socials.join(' / ') : 'grace' });
    const BH = 270;
    if (banner) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, BH); ctx.clip();
        const s = Math.max(W / banner.width, BH / banner.height);
        ctx.drawImage(banner, (W - banner.width * s) / 2, (BH - banner.height * s) / 2, banner.width * s, banner.height * s);
        ctx.restore();
        const fade = ctx.createLinearGradient(0, BH - 170, 0, BH + 6);
        const edge = U.mix(T.top, T.bottom, (BH + 6) / H);
        fade.addColorStop(0, U.rgba(edge, 0)); fade.addColorStop(1, U.rgba(edge, 1));
        ctx.fillStyle = fade; ctx.fillRect(0, BH - 170, W, 176);
    }
    ctx.restore();
    ctx.translate(0, -cut);          // everything below is laid out on the tall card

    // avatar
    const cx = W / 2, cy = 268, r = 66;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (avatar) ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
    else { ctx.fillStyle = U.mix(T.bottom, accent, 0.3); ctx.fillRect(cx - r, cy - r, r * 2, r * 2); U.text(ctx, String(o.user.name).slice(0, 1).toUpperCase(), cx, cy + 4, { font: U.FONT.bold, size: 70, color: fg, align: 'center', baseline: 'middle' }); }
    ctx.restore();
    const sx = cx + r * 0.74, sy = cy + r * 0.74;
    ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.fillStyle = U.mix(T.top, T.bottom, 0.45); ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.fillStyle = STATUS[o.status] ?? STATUS.offline; ctx.fill();

    // badges, top right over the banner
    const badges = (o.badges ?? []).slice(0, 8);
    if (badges.length || o.clan) {
        const size = 30, gap = 8, pad = 12;
        const tagW = o.clan ? U.measure(ctx, o.clan, 16, U.FONT.bold, 2) : 0;
        const row = badges.length * (size + gap) - (badges.length ? gap : 0);
        const inner = row + tagW + (row && tagW ? gap + 4 : 0);
        const pw = inner + pad * 2, px = W - 22 - pw;
        U.fillRR(ctx, px, 22, pw, size + 16, 16, 'rgba(0,0,0,0.55)');
        let bx = W - 22 - pad;
        if (o.clan) { U.text(ctx, o.clan, bx, 22 + 8 + 22, { font: U.FONT.bold, size: 16, color: '#ffffff', spacing: 2, align: 'right' }); bx -= tagW + gap + 4; }
        for (const bd of badges.slice().reverse()) { ctx.drawImage(bd, bx - size, 30, size, size); bx -= size + gap; }
    }

    // name + tagline
    const name = clean(o.user.name, 40) || 'unknown';
    U.text(ctx, name, cx, 386, { font: U.FONT.bold, size: 38, color: fg, align: 'center', maxWidth: 700 });
    if (o.user.bot) {
        const nw = Math.min(U.measure(ctx, name, 38, U.FONT.bold), 700);
        K.label(ctx, 'app', cx + nw / 2 + 36, 378, { color: accent, size: 14, align: 'center' });
    }
    const tagline = clean(card.tagline, 80);
    K.label(ctx, tagline || `@${clean(o.user.handle, 40)}`, cx, 418, { color: tagline ? U.rgba(fg, 0.78) : muted, size: 16, align: 'center', maxWidth: 720 });

    // short description
    const bio = clean(card.bio, 150);
    ctx.font = `20px "${U.FONT.serif}"`;
    const lines = wrap(ctx, bio || 'No description yet.', 660, 3);
    const top = 484 - (lines.length - 1) * 14;
    lines.forEach((l, i) => U.text(ctx, l, cx, top + i * 28, { font: U.FONT.serif, size: 20, color: bio ? U.rgba(fg, 0.85) : muted, align: 'center' }));

    // three details, in columns split by thin lines
    const cols = [['Location', clean(card.location, 40)], ['Age', clean(card.age, 3)], ['Profession', clean(card.profession, 50)]];
    const x0 = 80, cw = (W - x0 * 2) / 3, ty = 548;
    K.hairline(ctx, x0, ty, W - x0, ty, U.rgba(ink, 0.18), 1);
    cols.forEach(([label, value], i) => {
        const mx = x0 + cw * i + cw / 2;
        if (i) K.hairline(ctx, x0 + cw * i, ty + 18, x0 + cw * i, ty + 82, U.rgba(ink, 0.18), 1);
        K.label(ctx, label, mx, ty + 38, { color: muted, size: 14, align: 'center' });
        U.text(ctx, value || '-', mx, ty + 72, { font: U.FONT.bold, size: 22, color: value ? fg : muted, align: 'center', maxWidth: cw - 30 });
    });

    return canvas.toBuffer('image/png');
}

module.exports = { renderProfile, THEMES, themeKey, resolveTheme, parseHex, clean, W, H };
