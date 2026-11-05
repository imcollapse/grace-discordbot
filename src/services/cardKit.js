// grace · layout pieces shared by the canvas cards. Plain on purpose: flat background, one sans font,
// no frames, arrows, diamonds or divider lines.

const U = require('./cardArt');

/** A rounded-top ("arch") path. */
function archPath(ctx, x, y, w, h, bottom = 14) {
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x, y + h - bottom);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, 0);
    ctx.lineTo(x + w, y + h - bottom);
    ctx.quadraticCurveTo(x + w, y + h, x + w - bottom, y + h);
    ctx.lineTo(x + bottom, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bottom);
    ctx.closePath();
}

/** A round picture (or the first letter when there is none). No frame, no ring. Centred in the w×h box. */
function archPortrait(ctx, img, x, y, w, h, { label = '?', fill = '#1b1b20' } = {}) {
    const d = Math.min(w, h), cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.clip();
    if (img) {
        const s = Math.max(d / img.width, d / img.height);
        ctx.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
    } else {
        ctx.fillStyle = fill; ctx.fillRect(cx - d / 2, cy - d / 2, d, d);
        U.text(ctx, String(label).slice(0, 1).toUpperCase(), cx, cy + 4, { font: U.FONT.bold, size: Math.round(d * 0.5), color: 'rgba(255,255,255,0.7)', align: 'center', baseline: 'middle' });
    }
    ctx.restore();
}

/** Parse '#rrggbb' to [r,g,b]. */
const rgbOf = (hex) => { const c = U.hexToRgb(hex); return [c.r, c.g, c.b]; };

/**
 * The page every card sits on: a deep colour that fades from a lighter corner to a darker one, with a little
 * of the picture (cover / avatar) blurred underneath, and two small corner tags.
 *   tint  base colour of the card (a hex)
 *   art   optional image drawn blurred behind the colour
 *   light true for a pale card (dark text on it)
 *   tagLeft / tagRight  tiny labels in the corners
 */
function page(ctx, w, h, { tint = '#000000', top, bottom, art = null, light = false, tagLeft = '', tagRight = '', glow = true, radius = 0 } = {}) {
    const hi = top ?? (light ? U.mix(tint, '#ffffff', 0.35) : U.mix(tint, '#ffffff', 0.1));
    const lo = bottom ?? (light ? U.mix(tint, '#000000', 0.1) : U.mix(tint, '#000000', 0.55));
    ctx.save();
    if (radius) { U.rr(ctx, 0, 0, w, h, radius); ctx.clip(); }
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, hi); g.addColorStop(1, lo);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (art) {
        ctx.globalAlpha = 0.28; try { ctx.filter = 'blur(34px)'; } catch { /* no filter */ }
        const s = Math.max(w / art.width, h / art.height) * 1.25;
        ctx.drawImage(art, (w - art.width * s) / 2, (h - art.height * s) / 2, art.width * s, art.height * s);
        ctx.filter = 'none'; ctx.globalAlpha = 1;
        const veil = ctx.createLinearGradient(0, 0, w, h);
        veil.addColorStop(0, U.rgba(hi, 0.35)); veil.addColorStop(1, U.rgba(lo, 0.8));
        ctx.fillStyle = veil; ctx.fillRect(0, 0, w, h);
    }
    // soft light from the top left
    if (glow) {
        const gl = ctx.createRadialGradient(w * 0.15, 0, 0, w * 0.15, 0, Math.max(w, h) * 0.9);
        gl.addColorStop(0, U.rgba('#ffffff', light ? 0.22 : 0.07)); gl.addColorStop(1, U.rgba('#ffffff', 0));
        ctx.fillStyle = gl; ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    // two small tags in the corners (no brackets, no frames)
    const ink = light ? '#000000' : '#ffffff';
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const sc = Math.max(1, w / 1000);
    const m = cl(Math.round(Math.min(w, h) * 0.055), 18, 28) * sc;
    const tagSize = cl(Math.round(h * 0.03), 9, 11) * sc;
    if (tagLeft) U.text(ctx, String(tagLeft).toUpperCase(), m + 4, m + 8, { font: U.FONT.regular, size: tagSize, color: U.rgba(ink, 0.55), spacing: 1.2 });
    if (tagRight) U.text(ctx, String(tagRight).toUpperCase(), w - m - 4, h - m + 4, { font: U.FONT.regular, size: tagSize, color: U.rgba(ink, 0.5), spacing: 1.2, align: 'right' });
}

/** Small upper-case label with wide letter spacing. */
function label(ctx, str, x, y, { color = '#9a969c', size = 18, spacing, align = 'left', maxWidth } = {}) {
    const sz = Math.max(9, Math.round(size * 0.82));
    return U.text(ctx, String(str).toUpperCase(), x, y, { font: U.FONT.regular, size: sz, color, spacing: spacing ?? Math.max(1, sz * 0.14), align, maxWidth });
}

function hairline(ctx, x1, y1, x2, y2, color = 'rgba(255,255,255,0.12)', lw = 1) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}

/** A plain rounded progress bar. t is 0..1. */
function meter(ctx, x, y, w, t, { color = '#e58b9b', track = 'rgba(255,255,255,0.1)' } = {}) {
    ctx.save();
    U.rr(ctx, x, y - 3, w, 6, 3); ctx.fillStyle = track; ctx.fill();
    if (t > 0) { U.rr(ctx, x, y - 3, Math.max(6, w * Math.min(1, t)), 6, 3); ctx.fillStyle = color; ctx.fill(); }
    ctx.restore();
}

module.exports = { archPath, archPortrait, page, label, hairline, meter, rgbOf };
