// grace · image effects. All drawn locally with @napi-rs/canvas, no keys needed (background removal aside).
// run(name, canvas, arg) → a new canvas.

const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONTS = path.join(__dirname, '..', 'media', 'fonts');
let FONT = 'sans-serif';
try { GlobalFonts.registerFromPath(path.join(FONTS, 'Montserrat-Bold.ttf'), 'Meme Bold'); FONT = 'Meme Bold'; } catch (_) { /* system font */ }

const MAX = 1600;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

function blank(w, h) { const c = createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); return [c, c.getContext('2d')]; }
function copy(src) { const [c, g] = blank(src.width, src.height); g.drawImage(src, 0, 0); return [c, g]; }

/** Shrink huge images so effects stay fast. */
function fit(src) {
  const s = Math.min(1, MAX / Math.max(src.width, src.height));
  if (s === 1) return src;
  const [c, g] = blank(src.width * s, src.height * s);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Per-pixel effect. fn(r,g,b,a,i,data) returns [r,g,b] or mutates data. */
function pixels(src, fn) {
  const [c, g] = copy(src);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const o = fn(d[i], d[i + 1], d[i + 2], d[i + 3], i, d);
    if (o) { d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function convolve(src, k, { bias = 0, div = 1 } = {}) {
  const [c, g] = copy(src);
  const w = c.width, h = c.height;
  const from = g.getImageData(0, 0, w, h).data;
  const out = g.createImageData(w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, gg = 0, b = 0;
    for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) {
      const px = clamp(x + kx, 0, w - 1), py = clamp(y + ky, 0, h - 1);
      const i = (py * w + px) * 4, kv = k[(ky + 1) * 3 + kx + 1];
      r += from[i] * kv; gg += from[i + 1] * kv; b += from[i + 2] * kv;
    }
    const i = (y * w + x) * 4;
    o[i] = clamp(r / div + bias, 0, 255); o[i + 1] = clamp(gg / div + bias, 0, 255); o[i + 2] = clamp(b / div + bias, 0, 255); o[i + 3] = from[i + 3];
  }
  g.putImageData(out, 0, 0);
  return c;
}

/** Box blur, three passes ≈ gaussian. */
function blur(src, radius) {
  const r = Math.round(clamp(radius, 1, 40));
  const [c, g] = copy(src);
  const w = c.width, h = c.height;
  const img = g.getImageData(0, 0, w, h);
  let a = img.data, b = new Uint8ClampedArray(a.length);
  const pass = (from, to, horiz) => {
    const len = horiz ? w : h, lines = horiz ? h : w;
    for (let l = 0; l < lines; l++) {
      for (let ch = 0; ch < 4; ch++) {
        let sum = 0, count = 0;
        const at = (p) => (horiz ? (l * w + p) : (p * w + l)) * 4 + ch;
        for (let p = 0; p <= Math.min(r, len - 1); p++) { sum += from[at(p)]; count++; }
        for (let p = 0; p < len; p++) {
          to[at(p)] = sum / count;
          const add = p + r + 1, rem = p - r;
          if (add < len) { sum += from[at(add)]; count++; }
          if (rem >= 0) { sum -= from[at(rem)]; count--; }
        }
      }
    }
  };
  for (let i = 0; i < 3; i++) { pass(a, b, true); pass(b, a, false); }
  g.putImageData(img, 0, 0);
  return c;
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

const FX = {
  grayscale: { help: 'Black and white', run: (s) => pixels(s, (r, g, b) => { const v = lum(r, g, b); return [v, v, v]; }) },
  invert:    { help: 'Flip every colour', run: (s) => pixels(s, (r, g, b) => [255 - r, 255 - g, 255 - b]) },
  sepia:     { help: 'Old photo brown', run: (s) => pixels(s, (r, g, b) => [r * .393 + g * .769 + b * .189, r * .349 + g * .686 + b * .168, r * .272 + g * .534 + b * .131]) },
  blur:      { help: 'Soften. Strength 1-40', arg: 'strength', run: (s, a) => blur(s, num(a, 6)) },
  pixelate:  { help: 'Big blocks. Size 2-80', arg: 'size', run: (s, a) => {
    const n = clamp(Math.round(num(a, 12)), 2, 80);
    const [small, sg] = blank(s.width / n, s.height / n);
    sg.drawImage(s, 0, 0, small.width, small.height);
    const [c, g] = blank(s.width, s.height);
    g.imageSmoothingEnabled = false; g.drawImage(small, 0, 0, c.width, c.height);
    return c;
  } },
  sharpen:   { help: 'Crisper edges', run: (s) => convolve(s, [0, -1, 0, -1, 5, -1, 0, -1, 0]) },
  emboss:    { help: 'Raised relief', run: (s) => convolve(s, [-2, -1, 0, -1, 1, 1, 0, 1, 2], { bias: 0 }) },
  edges:     { help: 'Outline only', run: (s) => convolve(s, [-1, -1, -1, -1, 8, -1, -1, -1, -1]) },
  posterize: { help: 'Fewer colours. Levels 2-16', arg: 'levels', run: (s, a) => {
    const n = clamp(Math.round(num(a, 4)), 2, 16), step = 255 / (n - 1);
    return pixels(s, (r, g, b) => [Math.round(r / 255 * (n - 1)) * step, Math.round(g / 255 * (n - 1)) * step, Math.round(b / 255 * (n - 1)) * step]);
  } },
  threshold: { help: 'Pure black and white', arg: 'level', run: (s, a) => { const t = clamp(num(a, 128), 0, 255); return pixels(s, (r, g, b) => { const v = lum(r, g, b) > t ? 255 : 0; return [v, v, v]; }); } },
  solarize:  { help: 'Burnt highlights', run: (s) => pixels(s, (r, g, b) => [r > 128 ? 255 - r : r, g > 128 ? 255 - g : g, b > 128 ? 255 - b : b]) },
  brightness:{ help: 'Lighter or darker. -100 to 100', arg: 'amount', run: (s, a) => { const d = clamp(num(a, 30), -100, 100) * 2.55; return pixels(s, (r, g, b) => [r + d, g + d, b + d]); } },
  contrast:  { help: 'More or less punch. -100 to 100', arg: 'amount', run: (s, a) => { const v = clamp(num(a, 40), -100, 100), f = (259 * (v + 255)) / (255 * (259 - v)); return pixels(s, (r, g, b) => [f * (r - 128) + 128, f * (g - 128) + 128, f * (b - 128) + 128]); } },
  saturate:  { help: 'Colour strength. 0-300 (100 = same)', arg: 'percent', run: (s, a) => { const f = clamp(num(a, 180), 0, 300) / 100; return pixels(s, (r, g, b) => { const l = lum(r, g, b); return [l + (r - l) * f, l + (g - l) * f, l + (b - l) * f]; }); } },
  vignette:  { help: 'Dark corners', run: (s) => {
    const [c, g] = copy(s);
    const grad = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.25, c.width / 2, c.height / 2, Math.hypot(c.width, c.height) / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    return c;
  } },
  flip:      { help: 'Upside down', run: (s) => { const [c, g] = blank(s.width, s.height); g.translate(0, c.height); g.scale(1, -1); g.drawImage(s, 0, 0); return c; } },
  mirror:    { help: 'Left to right', run: (s) => { const [c, g] = blank(s.width, s.height); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(s, 0, 0); return c; } },
  rotate:    { help: 'Turn by degrees', arg: 'degrees', run: (s, a) => {
    const rad = num(a, 90) * Math.PI / 180, sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
    const [c, g] = blank(s.width * cos + s.height * sin, s.width * sin + s.height * cos);
    g.translate(c.width / 2, c.height / 2); g.rotate(rad); g.drawImage(s, -s.width / 2, -s.height / 2);
    return c;
  } },
  resize:    { help: 'Scale. 50 or 50% = half, or 800x600', arg: 'size', run: (s, a) => {
    const m = String(a || '50').match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    let w, h;
    if (m) { w = +m[1]; h = +m[2]; } else { const f = clamp(num(a, 50), 5, 400) / 100; w = s.width * f; h = s.height * f; }
    w = clamp(w, 16, 2400); h = clamp(h, 16, 2400);
    const [c, g] = blank(w, h); g.drawImage(s, 0, 0, c.width, c.height); return c;
  } },
  circle:    { help: 'Round avatar crop', run: (s) => {
    const d = Math.min(s.width, s.height), [c, g] = blank(d, d);
    g.beginPath(); g.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2); g.clip();
    g.drawImage(s, (d - s.width) / 2, (d - s.height) / 2); return c;
  } },
  round:     { help: 'Rounded corners', run: (s) => {
    const [c, g] = blank(s.width, s.height), r = Math.min(s.width, s.height) * 0.12;
    g.beginPath(); g.roundRect(0, 0, c.width, c.height, r); g.clip(); g.drawImage(s, 0, 0); return c;
  } },
  glitch:    { help: 'Shifted colour channels and torn rows', run: (s) => {
    const [c, g] = copy(s), w = c.width, h = c.height;
    const img = g.getImageData(0, 0, w, h), src = new Uint8ClampedArray(img.data), d = img.data;
    const shift = Math.max(3, Math.round(w * 0.012));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] = src[(y * w + clamp(x + shift, 0, w - 1)) * 4];
      d[i + 2] = src[(y * w + clamp(x - shift, 0, w - 1)) * 4 + 2];
    }
    for (let n = 0; n < 8; n++) {
      const y0 = Math.floor(Math.random() * h), band = Math.floor(h * 0.03) + 2, off = Math.floor((Math.random() - 0.5) * w * 0.18);
      for (let y = y0; y < Math.min(h, y0 + band); y++) for (let x = 0; x < w; x++) {
        const from = (y * w + clamp(x + off, 0, w - 1)) * 4, to = (y * w + x) * 4;
        d[to] = d[from]; d[to + 1] = d[from + 1]; d[to + 2] = d[from + 2];
      }
    }
    g.putImageData(img, 0, 0); return c;
  } },
  deepfry:   { help: 'Crunchy, oversaturated mess', run: (s) => {
    const sat = FX.saturate.run(s, 300), con = FX.contrast.run(sat, 70);
    const [c, g] = blank(con.width, con.height); g.drawImage(con, 0, 0);
    const small = createCanvas(Math.max(8, con.width / 3), Math.max(8, con.height / 3)); small.getContext('2d').drawImage(c, 0, 0, small.width, small.height);
    g.clearRect(0, 0, c.width, c.height); g.drawImage(small, 0, 0, c.width, c.height);
    return FX.sharpen.run(FX.sharpen.run(c));
  } },
  caption:   { help: 'Meme text. Use | to split top and bottom', arg: 'text', run: (s, a) => {
    const [top, bottom] = String(a || '').split('|').map(t => t.trim().toUpperCase());
    const [c, g] = copy(s);
    const size = Math.max(18, Math.round(c.width / 9));
    g.font = `${size}px "${FONT}"`; g.textAlign = 'center'; g.lineJoin = 'round';
    g.lineWidth = Math.max(4, size / 7); g.strokeStyle = '#000'; g.fillStyle = '#fff';
    const draw = (text, y, base) => {
      if (!text) return;
      g.textBaseline = base;
      const words = text.split(/\s+/), lines = []; let cur = '';
      for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > c.width * 0.94 && cur) { lines.push(cur); cur = w; } else cur = t; }
      lines.push(cur);
      const lh = size * 1.1;
      lines.forEach((l, i) => { const yy = base === 'top' ? y + i * lh : y - (lines.length - 1 - i) * lh; g.strokeText(l, c.width / 2, yy); g.fillText(l, c.width / 2, yy); });
    };
    draw(top, c.height * 0.03, 'top');
    draw(bottom, c.height * 0.97, 'bottom');
    return c;
  } },
};

const names = () => Object.keys(FX);

module.exports = { FX, fit, names };
