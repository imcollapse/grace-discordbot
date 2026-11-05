//
//  Made with care by cosmin
//

// grace — ship card. A soft dusty-rose canvas: two avatars, a dotted thread to a
// glowing compatibility ring in the middle, names below. Same pair = same
// percentage, so a ship never changes its mind.

/* global AbortSignal */
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const FONTS = path.join(__dirname, '..', 'media', 'fonts');
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  fontsReady = true;
  try {
    GlobalFonts.registerFromPath(path.join(FONTS, 'Montserrat-Bold.ttf'), 'Ship Bold');
    GlobalFonts.registerFromPath(path.join(FONTS, 'Montserrat-Regular.ttf'), 'Ship Regular');
  } catch (_) { /* falls back to the system sans */ }
}

const W = 1200;
const H = 480;
const CY = 215;

/** Stable 0-100 for a pair, whatever the order. */
function compatibility(idA, idB) {
  if (idA === idB) return 100;
  const key = [idA, idB].sort().join(':');
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 101;
}

const VERDICTS = [
  [10, 'worlds apart'],
  [25, 'a long shot'],
  [45, 'could become something'],
  [65, 'there is a spark'],
  [85, 'better than most'],
  [95, 'written in the stars'],
  [101, 'inseparable'],
];
const verdictFor = (p) => VERDICTS.find(([max]) => p < max)[1] ?? '';

/** Soft pink palette only: no neon, no pure white, same on every score. */
const PINK = { pale: '#ffd3dc', blush: '#ffb9c8', bright: '#ff8fa8', rose: '#f0698a', deep: '#d4476b' };
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

async function fetchImage(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch (_) {
    return null;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawAvatar(ctx, img, name, cx, cy, r, c1, c2) {
  // soft halo
  const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.7);
  halo.addColorStop(0, 'rgba(214,179,189,0.07)');
  halo.addColorStop(1, 'rgba(214,179,189,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = '#2a2226'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#d6b3bd'; ctx.font = '120px "Ship Bold"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((name[0] || '?').toUpperCase(), cx, cy + 6);
  }
  ctx.restore();

  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, c1); ring.addColorStop(1, c2);
  ctx.lineWidth = 6; ctx.strokeStyle = ring;
  ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, Math.PI * 2); ctx.stroke();
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function heart(ctx, cx, cy, s, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0.9);
  ctx.bezierCurveTo(-1.5, -0.1, -1, -1.1, 0, -0.45);
  ctx.bezierCurveTo(1, -1.1, 1.5, -0.1, 0, 0.9);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

/**
 * @param {{name:string, avatar:string}} a
 * @param {{name:string, avatar:string}} b
 * @returns {Promise<{buffer:Buffer, percent:number}>}
 */
async function renderShip(a, b, idA, idB) {
  const U = require('./cardArt');
  const K = require('./cardKit');
  U.registerFonts();
  const percent = compatibility(idA, idB);
  const [imgA, imgB] = await Promise.all([fetchImage(a.avatar), fetchImage(b.avatar)]);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  roundRect(ctx, 0, 0, W, H, 30); ctx.clip();

  K.page(ctx, W, H, { top: '#2a2326', bottom: '#151214', tagLeft: 'grace / ship', tagRight: 'grace' });

  // two arched portraits, the second one stepped down
  const PW = 188, PH = 270;
  K.archPortrait(ctx, imgA, 92, 82, PW, PH, { label: a.name, ring: PINK.pale });
  K.archPortrait(ctx, imgB, 336, 118, PW, PH, { label: b.name, ring: PINK.rose });
  ctx.textBaseline = 'alphabetic';
  U.text(ctx, a.name, 92, 412, { font: U.FONT.serif, size: 28, color: '#e8dfe0', maxWidth: PW });
  U.text(ctx, b.name, 336, 448, { font: U.FONT.serif, size: 28, color: '#e8dfe0', maxWidth: PW });
  // a small heart where the two frames meet
  heart(ctx, 312, 238, 11, rgba(PINK.rose, 0.9));

  K.hairline(ctx, 608, 70, 608, H - 70, 'rgba(214,179,189,0.2)');

  // the score
  const X = 668;
  K.label(ctx, 'compatibility', X, 118, { color: '#a89ba0', size: 17, spacing: 7 });
  const numW = U.text(ctx, String(percent), X - 4, 282, { font: U.FONT.serif, size: 168, color: '#efe5e6' });
  U.text(ctx, '%', X + numW + 8, 226, { font: U.FONT.serif, size: 52, color: PINK.blush });
  U.text(ctx, verdictFor(percent), X, 336, { font: U.FONT.regular, size: 27, color: '#b9a9ae', spacing: 1 });
  K.meter(ctx, X, 392, 440, percent / 100, { color: PINK.rose, track: 'rgba(214,179,189,0.16)' });
  K.label(ctx, '0', X, 428, { color: '#6f6468', size: 14, spacing: 2 });
  K.label(ctx, '100', X + 440, 428, { color: '#6f6468', size: 14, spacing: 2, align: 'right' });

  U.finish(ctx, W, H, { vignetteStrength: 0.22, grainAmount: 0.05 });
  return { buffer: canvas.toBuffer('image/png'), percent };
}

module.exports = { renderShip, compatibility, verdictFor };
