// grace · rank card. Avatar, level and rank on the right, a plain progress bar, and three small stats.
// The accent colour is the one the member picked for their profile card.

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const U = require('./cardArt');
const K = require('./cardKit');
const { resolveTheme } = require('./profileCard2');

const W = 900, H = 300;

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const tryLoad = async (src) => { if (!src) return null; try { return await loadImage(src); } catch { return null; } };

function voiceText(secs) {
    const m = Math.floor(secs / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return h >= 100 ? `${h}h` : `${h}h ${m % 60}m`;
}

/**
 * @param o { user:{name,handle,avatar}, theme, level, rank, into, span, pct, xp, messages, voiceSecs, status }
 */
async function renderRank(o) {
    U.registerFonts();
    const T = resolveTheme({ theme: o.theme, color: o.color });
    const accent = T.accent, fg = T.fg, muted = T.muted;
    const ink = T.dark ? '#ffffff' : '#000000';

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const avatar = await tryLoad(o.user.avatar);

    ctx.save();
    U.rr(ctx, 0, 0, W, H, 26); ctx.clip();
    K.page(ctx, W, H, { top: T.top, bottom: T.bottom, art: avatar, light: !T.dark, tagLeft: 'grace / rank', tagRight: 'level up' });
    ctx.restore();

    // avatar: a plain circle
    const cx = 130, cy = 150, r = 70;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (avatar) ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
    else { ctx.fillStyle = U.mix(T.bottom, accent, 0.3); ctx.fillRect(cx - r, cy - r, r * 2, r * 2); U.text(ctx, clean(o.user.name, 1).toUpperCase() || '?', cx, cy + 4, { font: U.FONT.bold, size: 64, color: fg, align: 'center', baseline: 'middle' }); }
    ctx.restore();

    const left = 252, right = W - 56;

    // level and rank, right side
    const lvl = String(o.level), rk = `#${o.rank}`;
    const lw = U.measure(ctx, lvl, 52, U.FONT.bold), rw = U.measure(ctx, rk, 52, U.FONT.bold);
    K.label(ctx, 'level', right, 74, { color: muted, size: 14, align: 'right' });
    U.text(ctx, lvl, right, 124, { font: U.FONT.bold, size: 52, color: fg, align: 'right' });
    const rx = right - Math.max(lw, 60) - 50;
    K.label(ctx, 'rank', rx, 74, { color: muted, size: 14, align: 'right' });
    U.text(ctx, rk, rx, 124, { font: U.FONT.bold, size: 52, color: fg, align: 'right' });

    // name, kept clear of the figures
    const room = Math.max(140, rx - rw - left - 24);
    U.text(ctx, clean(o.user.name, 32) || 'unknown', left, 106, { font: U.FONT.bold, size: 32, color: fg, maxWidth: room });
    K.label(ctx, `@${clean(o.user.handle, 32)}`, left, 134, { color: muted, size: 15, maxWidth: room });

    // plain progress bar
    const bw = right - left, by = 188;
    K.label(ctx, `${Math.floor(o.into).toLocaleString('en-US')} / ${Math.floor(o.span).toLocaleString('en-US')} xp`, left, by - 14, { color: U.rgba(fg, 0.85), size: 15 });
    K.label(ctx, `${Math.round(o.pct * 100)}%`, right, by - 14, { color: U.rgba(fg, 0.85), size: 15, align: 'right' });
    K.meter(ctx, left, by + 8, bw, o.pct, { color: fg, track: U.rgba(ink, 0.16) });

    // three figures, split by thin lines
    const cols = [['Messages', U.compact(o.messages)], ['Voice', voiceText(o.voiceSecs)], ['Total xp', U.compact(o.xp)]];
    const cw = bw / 3;
    K.hairline(ctx, left, 232, right, 232, U.rgba(ink, 0.16), 1);
    cols.forEach(([label, value], i) => {
        const x = left + cw * i;
        if (i) K.hairline(ctx, x, 244, x, 282, U.rgba(ink, 0.16), 1);
        K.label(ctx, label, x + 18, 258, { color: muted, size: 14 });
        U.text(ctx, value, x + 18, 282, { font: U.FONT.bold, size: 22, color: fg });
    });

    return canvas.toBuffer('image/png');
}

module.exports = { renderRank, W, H };
