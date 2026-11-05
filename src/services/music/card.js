/*
 * grace · music · now playing card
 *
 * A 1100x420 "aurora + vinyl" card:
 *   - the artwork is blurred into a soft aurora background and its colours tint
 *     the glow, the waveform and every accent
 *   - a vinyl record peeks out from behind the cover
 *   - the progress bar is a per-track waveform (stable for a given song)
 *   - small glass chips show the requester, volume, loop and autoplay state
 *
 * Original card renderer from AeroX Music (AeroX Development), redesigned for grace.
 */

const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const FONTS_DIR = path.join(__dirname, '..', '..', 'media', 'fonts');

const BOLD = '"Music Bold", "Noto Sans CJK JP", "Noto Sans", "DejaVu Sans", sans-serif';
const REG = '"Music Regular", "Noto Sans CJK JP", "Noto Sans", "DejaVu Sans", sans-serif';

let fontsReady = false;
function registerFonts() {
    if (fontsReady) return;
    fontsReady = true;
    try {
        GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Montserrat-Bold.ttf'), 'Music Bold');
        GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Montserrat-Regular.ttf'), 'Music Regular');
    } catch (e) {
        console.error('[MusicCard] could not register fonts:', e.message);
    }
}

/* ───────────────────────── colour helpers ───────────────────────── */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
}

/** Mix two colours through HSL along the shortest hue arc (RGB mixing turns complements grey). */
function mixHsl(a, b, t) {
    const [h1, s1, l1] = rgbToHsl(a[0], a[1], a[2]);
    const [h2, s2, l2] = rgbToHsl(b[0], b[1], b[2]);
    let dh = h2 - h1;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    return hslToRgb(h1 + dh * t, s1 + (s2 - s1) * t, l1 + (l2 - l1) * t);
}

const rgba = (c, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const DEFAULT_PALETTE = {
    accent: [124, 140, 255],
    accent2: [255, 124, 164],
    deep: [8, 8, 12],
};

/**
 * Pulls two vivid colours out of the artwork (weighted by saturation) and a deep,
 * tinted near-black that is used as the card's base colour.
 */
function extractPalette(img) {
    const S = 48;
    const c = createCanvas(S, S);
    const x = c.getContext('2d');
    coverDraw(x, img, 0, 0, S, S);
    const { data } = x.getImageData(0, 0, S, S);

    const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    let ar = 0;
    let ag = 0;
    let ab = 0;
    const n = S * S;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        ar += r; ag += g; ab += b;
        const [h, s, l] = rgbToHsl(r, g, b);
        const vib = s * (1 - Math.abs(2 * l - 1));
        const w = vib * vib;
        const bin = bins[Math.floor(h / 30) % 12];
        bin.w += w;
        bin.r += r * w;
        bin.g += g * w;
        bin.b += b * w;
    }

    const avg = [ar / n, ag / n, ab / n];
    const ranked = bins
        .map((b, i) => ({ ...b, i }))
        .filter((b) => b.w > 0.8)
        .sort((a, b) => b.w - a.w);

    // Keep the cover's hue but calm it down: low saturation, mid lightness. No neon.
    const tune = (rgb) => {
        const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
        return hslToRgb(h, clamp(s * 0.9, 0.4, 0.8), clamp(l, 0.52, 0.7));
    };

    let accent;
    let accent2;
    if (ranked.length) {
        const first = ranked[0];
        accent = tune([first.r / first.w, first.g / first.w, first.b / first.w]);
        const other = ranked.find((b) => {
            const d = Math.abs(b.i - first.i);
            return Math.min(d, 12 - d) >= 2;
        });
        if (other) {
            accent2 = tune([other.r / other.w, other.g / other.w, other.b / other.w]);
        } else {
            const [h, s, l] = rgbToHsl(accent[0], accent[1], accent[2]);
            accent2 = hslToRgb(h + 28, clamp(s * 0.9, 0.14, 0.34), clamp(l + 0.03, 0.5, 0.68));
        }
    } else {
        // greyscale / very muted artwork: stay soft and neutral-cool
        const [, , l] = rgbToHsl(avg[0], avg[1], avg[2]);
        accent = hslToRgb(222, 0.16, clamp(l + 0.4, 0.58, 0.72));
        accent2 = hslToRgb(280, 0.14, clamp(l + 0.4, 0.58, 0.72));
    }

    const [dh, ds] = rgbToHsl(accent[0], accent[1], accent[2]);
    const deep = hslToRgb(dh, clamp(ds * 0.7, 0.12, 0.5), 0.045);
    return { accent, accent2, deep };
}

/* ───────────────────────── drawing helpers ───────────────────────── */

function coverDraw(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function setSpacing(ctx, px) {
    try { ctx.letterSpacing = `${px}px`; } catch (_) { /* older builds ignore it */ }
}

function ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW) out = out.slice(0, -1);
    return `${out.trimEnd()}…`;
}

/** Largest size from the list that fits, otherwise the smallest one with an ellipsis. */
function fitText(ctx, text, maxW, family, sizes) {
    for (const size of sizes) {
        ctx.font = `${size}px ${family}`;
        if (ctx.measureText(text).width <= maxW) return { size, text };
    }
    const size = sizes[sizes.length - 1];
    ctx.font = `${size}px ${family}`;
    return { size, text: ellipsize(ctx, text, maxW) };
}

function pill(ctx, x, y, w, h, { fill = 'rgba(255,255,255,0.09)', stroke = 'rgba(255,255,255,0.16)' } = {}) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = stroke;
    ctx.stroke();
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** A stable, natural-looking waveform for a track (same song -> same shape). */
function waveformFor(seedText, count) {
    const rand = mulberry32(hashString(seedText || 'grace'));
    const p1 = rand() * Math.PI * 2;
    const p2 = rand() * Math.PI * 2;
    const p3 = rand() * Math.PI * 2;
    const f1 = 0.16 + rand() * 0.08;
    const f2 = 0.43 + rand() * 0.15;
    const f3 = 0.95 + rand() * 0.4;
    const out = [];
    for (let i = 0; i < count; i++) {
        const swell = 0.5 + 0.5 * Math.sin(i * f1 + p1);
        const mid = 0.5 + 0.5 * Math.sin(i * f2 + p2);
        const fine = 0.5 + 0.5 * Math.sin(i * f3 + p3);
        const v = 0.16 + 0.84 * (0.46 * swell + 0.3 * mid + 0.14 * fine + 0.1 * rand());
        out.push(clamp(v, 0.14, 1));
    }
    return out;
}

function formatClock(ms) {
    if (typeof ms !== 'number' || Number.isNaN(ms) || ms < 0) return '0:00';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/* small vector icons (so the card never depends on emoji / symbol fonts) */

function iconVolume(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 20, s / 20);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2, 7.5);
    ctx.lineTo(6.5, 7.5);
    ctx.lineTo(11.5, 3);
    ctx.lineTo(11.5, 17);
    ctx.lineTo(6.5, 12.5);
    ctx.lineTo(2, 12.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(11.5, 10, 4.6, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(11.5, 10, 8, -0.8, 0.8);
    ctx.stroke();
    ctx.restore();
}

function iconLoop(ctx, x, y, s, color, single = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 20, s / 20);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // top arrow ->
    ctx.beginPath();
    ctx.moveTo(3.5, 9);
    ctx.lineTo(3.5, 7);
    ctx.quadraticCurveTo(3.5, 4.5, 6, 4.5);
    ctx.lineTo(15.5, 4.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13, 1.8);
    ctx.lineTo(16.2, 4.5);
    ctx.lineTo(13, 7.2);
    ctx.closePath();
    ctx.fill();
    // bottom arrow <-
    ctx.beginPath();
    ctx.moveTo(16.5, 11);
    ctx.lineTo(16.5, 13);
    ctx.quadraticCurveTo(16.5, 15.5, 14, 15.5);
    ctx.lineTo(4.5, 15.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(7, 12.8);
    ctx.lineTo(3.8, 15.5);
    ctx.lineTo(7, 18.2);
    ctx.closePath();
    ctx.fill();
    if (single) {
        ctx.font = `bold 8px ${BOLD}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('1', 10, 10.2);
    }
    ctx.restore();
}

function iconSparkle(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 20, s / 20);
    ctx.fillStyle = color;
    const star = (cx, cy, r) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.quadraticCurveTo(cx, cy, cx + r, cy);
        ctx.quadraticCurveTo(cx, cy, cx, cy + r);
        ctx.quadraticCurveTo(cx, cy, cx - r, cy);
        ctx.quadraticCurveTo(cx, cy, cx, cy - r);
        ctx.fill();
    };
    star(8.5, 11, 8);
    star(16, 4.5, 3.6);
    ctx.restore();
}

function iconNote(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx - s / 2, cy - s / 2);
    ctx.scale(s / 24, s / 24);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(7.2, 18.4, 4.4, 3.4, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(11.3, 17.4);
    ctx.lineTo(11.3, 4.2);
    ctx.lineTo(19.6, 2.4);
    ctx.lineTo(19.6, 14.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(15.6, 15.6, 4.4, 3.4, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/* ───────────────────────── scene pieces ───────────────────────── */

function drawBackground(ctx, W, H, art, pal, artCenter) {
    ctx.fillStyle = rgba(pal.deep);
    ctx.fillRect(0, 0, W, H);

    // a smooth two-colour wash keeps the card cohesive even when the artwork is multi-coloured
    const wash = ctx.createLinearGradient(0, H, W, 0);
    wash.addColorStop(0, rgba(mix(pal.deep, pal.accent, 0.5)));
    wash.addColorStop(0.55, rgba(mix(pal.deep, mixHsl(pal.accent, pal.accent2, 0.5), 0.32)));
    wash.addColorStop(1, rgba(mix(pal.deep, pal.accent2, 0.42)));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    if (art) {
        ctx.save();
        ctx.filter = 'blur(42px) saturate(1.05) brightness(0.95)';
        ctx.globalAlpha = 0.5;
        coverDraw(ctx, art, -150, -170, W + 300, H + 340);
        ctx.restore();
    }

    // deep tint so text always has contrast, while the aurora still shows through
    ctx.fillStyle = rgba(pal.deep, art ? 0.34 : 0.12);
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glowA = ctx.createRadialGradient(artCenter.x, H * 0.95, 10, artCenter.x, H * 0.95, 480);
    glowA.addColorStop(0, rgba(pal.accent, 0.14));
    glowA.addColorStop(1, rgba(pal.accent, 0));
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, W, H);

    const glowB = ctx.createRadialGradient(W * 0.86, -30, 10, W * 0.86, -30, 440);
    glowB.addColorStop(0, rgba(pal.accent2, 0.1));
    glowB.addColorStop(1, rgba(pal.accent2, 0));
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // left -> right shade for the text column + soft vignette
    const shade = ctx.createLinearGradient(0, 0, W, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.0)');
    shade.addColorStop(0.4, 'rgba(0,0,0,0.2)');
    shade.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);

    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, W * 0.66);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
}

function drawGrain(ctx, W, H) {
    // very light film grain; also hides banding in the blurred gradients
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const rand = mulberry32(1337);
    for (let i = 0; i < d.length; i += 4) {
        const n = (rand() - 0.5) * 7;
        d[i] = clamp(d[i] + n, 0, 255);
        d[i + 1] = clamp(d[i + 1] + n, 0, 255);
        d[i + 2] = clamp(d[i + 2] + n, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
}

function drawVinyl(ctx, cx, cy, r, art, pal) {
    ctx.save();

    // drop shadow of the record
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 38;
    ctx.shadowOffsetX = 12;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0d';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const body = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    body.addColorStop(0, '#2b2b33');
    body.addColorStop(0.55, '#141418');
    body.addColorStop(1, '#09090b');
    ctx.fillStyle = body;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // grooves
    for (let rr = r * 0.4; rr < r * 0.985; rr += 3.4) {
        const a = 0.04 + (Math.sin(rr * 1.9) + 1) * 0.03;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // light sheen, tinted with the accent colour
    if (typeof ctx.createConicGradient === 'function') {
        const sheen = ctx.createConicGradient(-0.5, cx, cy);
        sheen.addColorStop(0.0, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.07, rgba(mix(pal.accent, [255, 255, 255], 0.35), 0.32));
        sheen.addColorStop(0.16, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.57, rgba(mix(pal.accent2, [255, 255, 255], 0.35), 0.26));
        sheen.addColorStop(0.66, 'rgba(255,255,255,0)');
        sheen.addColorStop(1.0, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();

    // rim
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.75, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // label
    const lr = r * 0.34;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, lr, 0, Math.PI * 2);
    ctx.clip();
    if (art) {
        coverDraw(ctx, art, cx - lr, cy - lr, lr * 2, lr * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(cx - lr, cy - lr, lr * 2, lr * 2);
    } else {
        const lg = ctx.createLinearGradient(cx - lr, cy - lr, cx + lr, cy + lr);
        lg.addColorStop(0, rgba(pal.accent));
        lg.addColorStop(1, rgba(pal.accent2));
        ctx.fillStyle = lg;
        ctx.fillRect(cx - lr, cy - lr, lr * 2, lr * 2);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, lr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, lr - 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // spindle hole
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = rgba(mix(pal.deep, [0, 0, 0], 0.4));
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}

function drawCover(ctx, x, y, size, radius, art, pal) {
    // coloured glow + shadow
    ctx.save();
    ctx.shadowColor = rgba(pal.accent, 0.28);
    ctx.shadowBlur = 46;
    ctx.shadowOffsetY = 16;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
    ctx.fillStyle = rgba(pal.deep);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
    ctx.clip();
    if (art) {
        coverDraw(ctx, art, x, y, size, size);
    } else {
        const g = ctx.createLinearGradient(x, y, x + size, y + size);
        g.addColorStop(0, rgba(pal.accent));
        g.addColorStop(1, rgba(pal.accent2));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x, y, size, size);
        iconNote(ctx, x + size / 2, y + size / 2, size * 0.36, 'rgba(255,255,255,0.92)');
    }
    // glossy highlight
    const gloss = ctx.createLinearGradient(x, y, x + size * 0.9, y + size * 0.9);
    gloss.addColorStop(0, 'rgba(255,255,255,0.20)');
    gloss.addColorStop(0.35, 'rgba(255,255,255,0.03)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(x, y, size, size);
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5, radius - 0.75);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function drawEqualizer(ctx, x, y, color) {
    const heights = [9, 17, 12, 19];
    ctx.fillStyle = color;
    heights.forEach((h, i) => {
        ctx.beginPath();
        ctx.roundRect(x + i * 6, y + (20 - h), 3.6, h, 1.8);
        ctx.fill();
    });
}

/* ───────────────────────── the card ───────────────────────── */

class MusicCard {
    constructor() {
        registerFonts();
    }

    formatDuration(ms) {
        return formatClock(ms);
    }

    async #load(url, timeoutMs = 4500) {
        if (!url) return null;
        try {
            return await Promise.race([
                loadImage(url),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
            ]);
        } catch (_) {
            return null;
        }
    }

    /**
     * Now playing card.
     * options: { track, position, player }
     * returns a PNG buffer
     */
    async generateNowPlayingCard({ track, position = 0, player } = {}) {
        registerFonts();

        // drawn on a 900 x 350 board, saved at 1.5x so it stays sharp
        const BW = 900, BH = 350, SC = 1.5;
        const canvas = createCanvas(BW * SC, BH * SC);
        const ctx = canvas.getContext('2d');
        ctx.scale(SC, SC);

        const info = track?.info || {};
        const length = Number(info.length) || 0;
        const isStream = !!info.isStream;
        const artworkUrl = info.artworkUrl || info.image || track?.pluginInfo?.artworkUrl || null;
        const requester = info.requester || null;

        const art = await this.#load(artworkUrl);
        const pal = art ? extractPalette(art) : DEFAULT_PALETTE;

        const U = require('../cardArt'), K = require('../cardKit');
        U.registerFonts();
        const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
        const paused = !!player?.isPaused;
        const tint = hex(mix(mix(pal.deep, pal.accent, 0.12), [0, 0, 0], 0.2));
        const cream = hex(mix(pal.accent, [255, 255, 255], 0.78));
        const dim = (a) => rgba(mix(pal.accent, [255, 255, 255], 0.78), a);

        /* ---- page: tinted fade, blurred cover underneath, brackets and two small tags ---- */
        ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, BW, BH, 22); ctx.clip();
        K.page(ctx, BW, BH, { tint, art, tagLeft: 'grace / fm', tagRight: 'grace' });
        ctx.restore();
        const T = (str, x, y, o = {}) => U.text(ctx, str, x, y, o);
        const tag = (str, x, y, o = {}) => T(String(str).toUpperCase(), x, y, { font: U.FONT.regular, size: 9.5, color: dim(0.62), spacing: 1.4, ...o });

        /* ---- cover: soft shadow, light edge, fine diagonal lines over the picture ---- */
        const cs = 226, cx0 = 52, cy0 = 62;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
        ctx.beginPath(); ctx.roundRect(cx0, cy0, cs, cs, 8); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.roundRect(cx0, cy0, cs, cs, 8); ctx.clip();
        if (art) coverDraw(ctx, art, cx0, cy0, cs, cs);
        else { ctx.fillStyle = rgba(mix(pal.deep, pal.accent, 0.25)); ctx.fillRect(cx0, cy0, cs, cs); iconNote(ctx, cx0 + cs / 2, cy0 + cs / 2, 90, rgba(pal.accent, 0.55)); }
        ctx.strokeStyle = dim(0.22); ctx.lineWidth = 0.8;
        for (let d = -cs; d < cs; d += 7) { ctx.beginPath(); ctx.moveTo(cx0 + d, cy0 + cs); ctx.lineTo(cx0 + d + cs, cy0); ctx.stroke(); }
        ctx.restore();
        ctx.strokeStyle = dim(0.55); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(cx0, cy0, cs, cs, 8); ctx.stroke();

        // under the cover: NOW  PLAYING and a bar
        const state = isStream ? 'live' : paused ? 'paused' : 'playing';
        tag('now', cx0, 312, { color: dim(0.45) });
        tag(state, cx0 + 52, 312, { color: dim(0.95) });
        ctx.fillStyle = dim(0.7); ctx.fillRect(cx0, 322, cs, 3);

        // vertical divider
        K.hairline(ctx, 316, 30, 316, 322, dim(0.2), 1);

        /* ---- right column ---- */
        const x0 = 356, x1 = 846, colW = x1 - x0;
        tag('now playing', x0, 62, { size: 10 });

        const title = fitText(ctx, info.title || "Unknown title", colW - 24, `"${U.FONT.serif}"`, [42, 38, 34, 30, 26]);
        T(title.text, x0, 108, { font: U.FONT.serif, size: title.size, color: cream, spacing: 1 });
        const artistName = String(info.author || 'Unknown artist').toUpperCase();
        const ar = fitText(ctx, artistName, colW - 24, `"${U.FONT.bold}"`, [17, 15, 13]);
        T(artistName.length > 40 ? artistName.slice(0, 39) + '…' : artistName, x0, 150, { font: U.FONT.bold, size: ar.size, color: dim(0.9), spacing: 1.2 });

        // status row
        const volume = Math.round(player?.volume ?? 100);
        const loopMode = player?.loop || 'NONE';
        const requesterName = String(requester?.globalName || requester?.username || 'Unknown');
        tag(state, x0, 178, { color: dim(0.95) });
        tag(loopMode === 'TRACK' ? 'loop track' : loopMode === 'QUEUE' ? 'loop queue' : 'loop off', x0 + 104, 178);
        tag(`vol ${volume}%`, x0 + 214, 178);
        tag(`by ${requesterName.length > 16 ? requesterName.slice(0, 15) + '…' : requesterName}`, x0 + 300, 178);

        // waveform progress: played bars bright, the rest dim, a thin marker at the position
        const progress = isStream || !length ? 1 : clamp(position / length, 0, 1);
        let seed = 0; for (const ch of String(info.title || 'x') + String(info.identifier || '')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const bw = 6, gap = 5, n = Math.floor((colW + gap) / (bw + gap)), mid = 228;
        for (let i = 0; i < n; i++) {
            const smooth = 0.5 + 0.5 * Math.sin(i * 0.55) * Math.cos(i * 0.21);
            const h = 10 + (smooth * 0.55 + rnd() * 0.45) * 30;
            const x = x0 + i * (bw + gap), played = (i + 0.5) / n <= progress;
            ctx.fillStyle = played ? dim(0.9) : dim(0.2);
            ctx.beginPath(); ctx.roundRect(x, mid - h / 2, bw, h, 1.5); ctx.fill();
        }
        if (!isStream && length) {
            const mx = x0 + colW * progress;
            ctx.fillStyle = '#ffffff'; ctx.fillRect(mx - 1, mid - 28, 2, 56);
        }
        tag(formatClock(position), x0, 270, { size: 10, color: dim(0.7) });
        tag(isStream ? 'live' : formatClock(length), x1, 270, { size: 10, color: dim(0.5), align: 'right' });
        K.hairline(ctx, x0, 284, x1, 284, dim(0.18), 1);

        // up next
        const next = player?.queue?.[0];
        tag('up next', x0, 318, { size: 11, color: dim(0.8) });
        const nextTitle = next?.info?.title ? `${next.info.title}${next.info.author ? ` - ${next.info.author}` : ''}` : 'Queue ends after this track';
        ctx.font = `15px "${U.FONT.bold}"`;
        T(ellipsize(ctx, nextTitle, x1 - x0 - 120), x0 + 96, 318, { font: U.FONT.bold, size: 15, color: dim(0.92) });

        return canvas.toBuffer('image/png');
    }
}

module.exports = { MusicCard, musicCard: new MusicCard(), extractPalette };
