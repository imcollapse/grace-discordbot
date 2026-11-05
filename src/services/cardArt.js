// Shared canvas helpers for the card images (fonts, text, shapes, seeded random).

const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = path.join(__dirname, '..', 'media', 'fonts', 'cards');

// Own family names so we never clash with the ones profileCard registers.
//   serif → big titles (Courier Prime) · bold → strong text (Courier Prime Bold)
//   regular → small labels and body (Space Mono) · mono → bold labels / numbers (Space Mono Bold)
const FONT = { serif: 'GC Type', bold: 'GC Type Bold', regular: 'GC Mono', mono: 'GC Mono Bold', cond: 'GC Type Bold' };
let fontsReady = false;

function registerFonts() {
    if (fontsReady) return;
    fontsReady = true;
    const reg = (file, name) => {
        try { GlobalFonts.registerFromPath(path.join(FONT_DIR, file), name); }
        catch (err) { console.error(`[cards] font ${file} failed:`, err.message); }
    };
    reg('CourierPrime-Regular.ttf', FONT.serif);
    reg('CourierPrime-Bold.ttf', FONT.bold);
    reg('SpaceMono-Regular.ttf', FONT.regular);
    reg('SpaceMono-Bold.ttf', FONT.mono);
}

// "Flat" mode: icons collapse gradients/glows into solid fills (editorial look).
let flat = false;
const setFlat = (v) => { const prev = flat; flat = !!v; return prev; };
const isFlat = () => flat;

/** Small deterministic PRNG so scenes look the same every render. */
function rng(seed = 1) {
    let a = (seed >>> 0) || 1;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

function fillRR(ctx, x, y, w, h, r, fill) {
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
}

function strokeRR(ctx, x, y, w, h, r, stroke, lw = 2) {
    rr(ctx, x, y, w, h, r);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
}

/**
 * Every colour the cards draw with goes through here. Saturation is pulled down and a little warm grey is mixed in,
 * so nothing comes out neon. Dark and near-grey colours are barely touched.
 */
const SOFT = { sat: 0.94, grey: [138, 132, 124], greyMix: 0 };
function soften(r, g, b) {
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, d = mx - mn;
    if (d < 0.02) return [r, g, b];
    const s = d / (1 - Math.abs(2 * l - 1));
    const k = Math.min(1, (SOFT.sat * (s > 0.7 ? 0.8 : 1)) );    // the more vivid, the more it is calmed
    const gray = (r + g + b) / 3;
    const out = [r, g, b].map((v) => gray + (v - gray) * k);
    return out.map((v, i) => Math.round(Math.max(0, Math.min(255, v + (SOFT.grey[i] - v) * SOFT.greyMix * Math.min(1, l * 2)))));
}
function hexToRgb(hex) {
    const h = String(hex).replace('#', '');
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(f, 16);
    const [r, g, b] = soften((n >> 16) & 255, (n >> 8) & 255, n & 255);
    return { r, g, b };
}
const rgba = (hex, a = 1) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
    return `#${c(A.r, B.r)}${c(A.g, B.g)}${c(A.b, B.b)}`;
}

/** Vertical / diagonal gradient from an array of colours (evenly spaced stops). */
function linear(ctx, x0, y0, x1, y1, colors) {
    if (flat) return colors.length > 2 ? colors[1] : colors[0];
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
    return g;
}

function radial(ctx, x, y, r0, r1, stops) {
    if (flat) return (stops.length > 2 ? stops[1] : stops[0])[1];
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
}

/**
 * Text with optional shadow / stroke / letter spacing.
 * opts: { font, size, color, align, baseline, shadow, stroke, strokeWidth, spacing, alpha, maxWidth, italic }
 * Returns the drawn width.
 */
function text(ctx, str, x, y, opts = {}) {
    const {
        font = FONT.bold, size = 24, color = '#fff', align = 'left', baseline = 'alphabetic',
        shadow, stroke, strokeWidth = 4, spacing = 0, alpha = 1, maxWidth, italic = false,
    } = opts;
    str = String(str);
    let s = size;
    const setFont = () => { ctx.font = `${italic ? 'italic ' : ''}${s}px "${font}"`; };
    setFont();
    const measure = () => ctx.measureText(str).width + spacing * Math.max(0, str.length - 1);
    if (maxWidth) while (measure() > maxWidth && s > 8) { s -= 1; setFont(); }

    const width = measure();
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.textBaseline = baseline;
    ctx.textAlign = 'left';
    let startX = x;
    if (align === 'center') startX = x - width / 2;
    else if (align === 'right') startX = x - width;

    const draw = (fn) => {
        if (!spacing) { fn(str, startX, y); return; }
        let cx = startX;
        for (const ch of str) { fn(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
    };

    if (shadow) { ctx.shadowColor = shadow.color || 'rgba(0,0,0,.6)'; ctx.shadowBlur = shadow.blur ?? 10; ctx.shadowOffsetX = shadow.x ?? 0; ctx.shadowOffsetY = shadow.y ?? 3; }
    if (stroke) {
        ctx.lineJoin = 'round'; ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke;
        draw((t, px, py) => ctx.strokeText(t, px, py));
        ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = color;
    draw((t, px, py) => ctx.fillText(t, px, py));
    ctx.restore();
    return width;
}

function measure(ctx, str, size, font = FONT.bold, spacing = 0) {
    ctx.save();
    ctx.font = `${size}px "${font}"`;
    const w = ctx.measureText(String(str)).width + spacing * Math.max(0, String(str).length - 1);
    ctx.restore();
    return w;
}

/** Soft glow: draws `fn` blurred first, then crisp on top. */
function glow(ctx, color, blur, fn) {
    if (flat) { ctx.save(); fn(); ctx.restore(); return; }
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * 0.55;
    fn();
    ctx.restore();
}

function star(ctx, cx, cy, r, points = 4, inner = 0.35) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const a = (Math.PI / points) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * inner;
        ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
}

function sparkle(ctx, cx, cy, r, color = '#fff', alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = r * 0.6;
    star(ctx, cx, cy, r, 4, 0.22);
    ctx.fill();
    ctx.restore();
}

function stars(ctx, w, h, { seed = 7, count = 60, maxY = h, color = '#fff' } = {}) {
    const rand = rng(seed);
    ctx.save();
    for (let i = 0; i < count; i++) {
        const x = rand() * w, y = rand() * maxY, r = 0.5 + rand() * 1.4;
        ctx.globalAlpha = 0.25 + rand() * 0.65;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        if (rand() > 0.93) sparkle(ctx, x, y, 3 + rand() * 3, color, 0.9);
    }
    ctx.restore();
}

/** Circular image clip. */
function circleImage(ctx, img, cx, cy, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
}

/** A fine film grain, so flat colour does not look digital. Deterministic, cheap (a few thousand 1px dots). */
function grain(ctx, w, h, { amount = 0.05, seed = 11 } = {}) {
    const rand = rng(seed);
    ctx.save();
    const dots = Math.floor((w * h) / 260);
    for (let i = 0; i < dots; i++) {
        ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${amount * rand()})` : `rgba(0,0,0,${amount * 1.4 * rand()})`;
        ctx.fillRect(rand() * w, rand() * h, 1, 1);
    }
    ctx.restore();
}
/** Darkens the edges a little, which pulls the eye to the middle. */
function vignette(ctx, w, h, strength = 0.28) {
    ctx.save();
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
}
/** The last touch on a finished card. */
function finish(ctx, w, h, { vignetteStrength = 0.24, grainAmount = 0.05, seed = 11 } = {}) {
    if (vignetteStrength) vignette(ctx, w, h, vignetteStrength * 0.4);
    if (grainAmount) grain(ctx, w, h, { amount: grainAmount * 0.25, seed });
}

const compact = (n) => {
    n = Math.floor(Number(n) || 0);
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return n.toLocaleString('en-US');
};

module.exports = {
    FONT, registerFonts, setFlat, isFlat, rng, hashString, rr, fillRR, strokeRR, hexToRgb, rgba, mix,
    linear, radial, text, measure, glow, star, sparkle, stars, circleImage, compact, soften, grain, vignette, finish,
};
