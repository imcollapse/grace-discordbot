// grace · captcha cards. Simple on purpose: readable for people, annoying for scripts.
// Returns { code, buffer } where buffer is a PNG.

const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const U = require('./cardArt');
const K = require('./cardKit');

const FONTS = path.join(__dirname, '..', 'media', 'fonts');
let fontOk = false;
try { GlobalFonts.registerFromPath(path.join(FONTS, 'Montserrat-Bold.ttf'), 'Captcha Bold'); fontOk = true; } catch (_) { /* falls back to a system font */ }
const FONT = fontOk ? 'Captcha Bold' : 'sans-serif';

// no 0/O, 1/I/l, 5/S, 2/Z — nothing people can misread
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY346789';
const INK = ['#2b4a9e', '#a8324f', '#1f7a5c', '#5b3fb0', '#b0651a', '#1f6a9e'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function makeCode(length = 5) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

function render(code = makeCode()) {
  const W = 560, H = 236, CY = 100;
  U.registerFonts();
  const c = createCanvas(W, H);
  const g = c.getContext('2d');

  // soft warm-paper background
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#e6e2da'); bg.addColorStop(0.55, '#ddd9d3'); bg.addColorStop(1, '#e3dcd8');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const FH = 200;   // the code lives in the top part, a caption strip sits underneath

  // speckles
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${Math.floor(rnd(90, 170))},${Math.floor(rnd(90, 170))},${Math.floor(rnd(100, 180))},${rnd(0.1, 0.28)})`;
    g.beginPath(); g.arc(rnd(0, W), rnd(0, FH), rnd(1, 3.2), 0, Math.PI * 2); g.fill();
  }

  // wavy lines behind the letters
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = `${pick(INK)}55`; g.lineWidth = rnd(1.5, 3);
    g.beginPath();
    const y0 = rnd(30, FH - 30), amp = rnd(10, 28), f = rnd(0.012, 0.03), ph = rnd(0, 6);
    for (let x = 0; x <= W; x += 6) { const y = y0 + Math.sin(x * f + ph) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }

  // the code
  const step = (W - 90) / code.length;
  g.textBaseline = 'middle'; g.textAlign = 'center';
  [...code].forEach((ch, i) => {
    const size = rnd(74, 96);
    g.save();
    g.translate(60 + step * i + step / 2, CY + rnd(-14, 14));
    g.rotate(rnd(-0.38, 0.38));
    g.transform(1, rnd(-0.12, 0.12), rnd(-0.18, 0.18), 1, 0, 0);
    g.font = `${size}px "${FONT}"`;
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeText(ch, 0, 0);
    g.fillStyle = pick(INK); g.fillText(ch, 0, 0);
    g.restore();
  });

  // strike-through lines on top
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = `${pick(INK)}aa`; g.lineWidth = rnd(2, 3.5);
    g.beginPath();
    g.moveTo(rnd(0, 60), rnd(30, FH - 30));
    g.bezierCurveTo(rnd(120, 240), rnd(0, FH), rnd(300, 440), rnd(0, FH), rnd(W - 60, W), rnd(30, FH - 30));
    g.stroke();
  }

  // caption strip + hairline frame (kept off the letters)
  g.fillStyle = 'rgba(58,52,48,0.07)'; g.fillRect(0, FH, W, H - FH);
  g.fillStyle = 'rgba(58,52,48,0.22)'; g.fillRect(24, FH, W - 48, 1.5);
  K.label(g, 'type the letters you see', W / 2, FH + 26, { color: '#6c655d', size: 14, spacing: 5, align: 'center' });
  U.strokeRR(g, 8, 8, W - 16, H - 16, 18, 'rgba(58,52,48,0.28)', 1.5);

  return { code, buffer: c.toBuffer('image/png') };
}

module.exports = { makeCode, render };
