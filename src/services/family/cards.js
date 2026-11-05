// Family — canvas cards (@napi-rs/canvas). Every function returns a PNG Buffer.
//   pairCard (proposal / married / adopted / relationship) · profileCard · treeCard
//
// Look: quiet charcoal panels with dusty rose and sand accents, Gloock serif headlines, Outfit for UI text,
// letter-spaced eyebrows and soft glows. Fonts are the ones bundled under media/fonts/cards.

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const U = require('../cardArt');
const K = require('../cardKit');
const R = require('./relations');

const { FONT } = U;
const TAU = Math.PI * 2;

const C = {
    bg: '#08090b', panel: '#101216', panel2: '#181b21', edge: '#272b33', line: '#3a404c',
    rose: '#f0708a', gold: '#e8b45a', cream: '#f6f3ee', muted: '#9ea1ab', soft: '#d2d0cb', lav: '#a58bff',
};

/* ── helpers ────────────────────────────────────────────────────────── */

function make(w, h) {
    U.registerFonts();
    const canvas = createCanvas(w, h);
    return { canvas, ctx: canvas.getContext('2d'), w, h };
}
const png = (c) => {
    try { U.finish(c.getContext('2d'), c.width, c.height, { vignetteStrength: 0.2, grainAmount: 0.045 }); } catch { /* keep the card as drawn */ }
    return c.toBuffer('image/png');
};

async function img(src) {
    if (!src) return null;
    try { return await loadImage(src); } catch { return null; }
}

function spark(ctx, x, y, r, color = C.cream) {
    ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(3, r * 0.28), 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function eyebrow(ctx, str, x, y, { color = C.muted, size = 24, spacing = 7, align = 'left', maxWidth } = {}) {
    return U.text(ctx, String(str).toUpperCase(), x, y, { size, color, spacing, align, font: FONT.regular, maxWidth });
}

function rule(ctx, x1, x2, y, { color = C.line, orn = null, ornColor = C.gold } = {}) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    if (orn) { const m = (x1 + x2) / 2; ctx.moveTo(x1, y); ctx.lineTo(m - 24, y); ctx.moveTo(m + 24, y); ctx.lineTo(x2, y); ctx.stroke(); spark(ctx, m, y, 13, ornColor); }
    else { ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); }
    ctx.restore();
}

/** Page: soft charcoal gradient, a hairline frame with small corner ticks. */
function backdrop(ctx, w, h, { glowA = C.rose } = {}) {
    K.page(ctx, w, h, { top: '#2b2027', bottom: '#0d090c', tagLeft: 'grace / family', tagRight: 'grace', radius: 36 });
}

/** Round avatar with one hairline ring set off from it. Falls back to an initial on a quiet disc. */
function avatar(ctx, image, cx, cy, r, name = '?', { ring = C.gold, ringW = 2, gap = 8 } = {}) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    if (image) ctx.drawImage(image, cx - r, cy - r, r * 2, r * 2);
    else {
        ctx.fillStyle = C.panel2; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        U.text(ctx, String(name).slice(0, 1).toUpperCase(), cx, cy + r * 0.36, { size: r * 1.15, align: 'center', color: U.rgba(ring, 0.85), font: FONT.serif });
    }
    ctx.restore();
}

function heart(ctx, cx, cy, s, color = C.rose) {
    ctx.save();
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.55);
    ctx.bezierCurveTo(cx + s * 1.15, cy - s * 0.15, cx + s * 0.62, cy - s * 0.95, cx, cy - s * 0.38);
    ctx.bezierCurveTo(cx - s * 0.62, cy - s * 0.95, cx - s * 1.15, cy - s * 0.15, cx, cy + s * 0.55);
    ctx.fill(); ctx.restore();
}

function rings(ctx, cx, cy, s, color = C.gold) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = s * 0.11;
    ctx.beginPath(); ctx.arc(cx - s * 0.34, cy + s * 0.12, s * 0.5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + s * 0.34, cy + s * 0.12, s * 0.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = C.cream; ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.62); ctx.lineTo(cx + s * 0.16, cy - s * 0.42); ctx.lineTo(cx, cy - s * 0.24); ctx.lineTo(cx - s * 0.16, cy - s * 0.42); ctx.closePath(); ctx.fill();
    ctx.restore();
}

function house(ctx, cx, cy, s, color = C.gold) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = s * 0.1; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx - s * 0.62, cy - s * 0.05); ctx.lineTo(cx, cy - s * 0.66); ctx.lineTo(cx + s * 0.62, cy - s * 0.05);
    ctx.moveTo(cx - s * 0.48, cy - s * 0.12); ctx.lineTo(cx - s * 0.48, cy + s * 0.55); ctx.lineTo(cx + s * 0.48, cy + s * 0.55); ctx.lineTo(cx + s * 0.48, cy - s * 0.12); ctx.stroke();
    heart(ctx, cx, cy + s * 0.2, s * 0.2, C.rose, false);
    ctx.restore();
}

function diamond(ctx, cx, cy, s, color = C.gold) {
    ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, s * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function pill(ctx, x, y, h, text, { color = C.cream, border = C.line, bg = 'rgba(0,0,0,0)', size = 30, pad = 30, dot } = {}) {
    const tw = U.measure(ctx, text, size, FONT.regular);
    const w = tw + pad * 2 + (dot ? 26 : 0);
    U.fillRR(ctx, x, y, w, h, h / 2, bg);
    let tx = x + pad;
    if (dot) { spark(ctx, tx + 6, y + h / 2, 16, dot); tx += 26; }
    U.text(ctx, text, tx, y + h / 2 + size * 0.34, { size, color, font: FONT.regular });
    return w;
}

const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const ago = (ms) => {
    const d = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
    if (d < 1) return 'today';
    if (d < 31) return `${d} day${d === 1 ? '' : 's'}`;
    const mo = Math.floor(d / 30.44);
    if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'}`;
    const y = Math.floor(mo / 12), rm = mo % 12;
    return `${y} year${y === 1 ? '' : 's'}${rm ? ` ${rm}mo` : ''}`;
};

/* ── pair card: proposal / married / adopted / relationship ─────────── */

const MODES = {
    propose_marry: { eyebrow: 'Marriage proposal', title: 'Will you marry me?', icon: 'heart', roles: ['Proposing', 'The one'], accent: C.rose },
    propose_adopt: { eyebrow: 'Adoption offer', title: 'Join my family?', icon: 'house', roles: ['Parent', 'Child'], accent: C.gold },
    married: { eyebrow: 'Congratulations', title: 'Just Married', icon: 'rings', roles: ['Spouse', 'Spouse'], accent: C.rose },
    adopted: { eyebrow: 'A new chapter', title: 'Welcome Home', icon: 'house', roles: ['Parent', 'Child'], accent: C.gold },
    relation: { eyebrow: 'Relationship', title: '', icon: 'diamond', roles: ['', ''], accent: C.lav },
};

/** Split a title into at most two balanced lines that fit `maxW`. */
function twoLines(ctx, str, size, maxW) {
    ctx.save(); ctx.font = `${size}px "${FONT.serif}"`;
    const fits = (t) => ctx.measureText(t).width <= maxW;
    ctx.restore();
    if (fits(str) || !str.includes(' ')) return [str];
    const words = str.split(' ');
    let best = [str, ''], bestGap = Infinity;
    for (let i = 1; i < words.length; i++) {
        const l = words.slice(0, i).join(' '), r = words.slice(i).join(' ');
        const gap = Math.abs(l.length - r.length);
        if (gap < bestGap) { best = [l, r]; bestGap = gap; }
    }
    return best;
}

async function pairCard({ mode = 'propose_marry', left = {}, right = {}, title, sub = '', footer = '', roles } = {}) {
    const M = MODES[mode] || MODES.propose_marry;
    const { canvas, ctx, w, h } = make(1600, 830);
    backdrop(ctx, w, h, { glowA: M.accent });
    const [li, ri] = await Promise.all([img(left.avatar), img(right.avatar)]);
    const rl = roles || M.roles;

    // two arched portraits, set a little off each other
    const pw = 330, ph = 440;
    const lx = 150, rx = w - 150 - pw, ly = 150, ry = 190;
    K.archPortrait(ctx, li, lx, ly, pw, ph, { label: left.name, ring: M.accent, fill: C.panel2, frameGap: 11 });
    K.archPortrait(ctx, ri, rx, ry, pw, ph, { label: right.name, ring: C.gold, fill: C.panel2, frameGap: 11 });
    U.text(ctx, left.name || '?', lx + pw / 2, ly + ph + 82, { size: 44, color: C.cream, font: FONT.serif, align: 'center', maxWidth: pw + 60 });
    U.text(ctx, right.name || '?', rx + pw / 2, ry + ph + 82, { size: 44, color: C.cream, font: FONT.serif, align: 'center', maxWidth: pw + 60 });
    if (rl[0]) K.label(ctx, rl[0], lx + pw / 2, ly + ph + 122, { color: M.accent, size: 16, spacing: 6, align: 'center' });
    if (rl[1]) K.label(ctx, rl[1], rx + pw / 2, ry + ph + 122, { color: C.gold, size: 16, spacing: 6, align: 'center' });

    // the middle column
    const cx = w / 2, colW = 520;
    K.label(ctx, M.eyebrow, cx, 214, { color: M.accent, size: 17, spacing: 8, align: 'center' });
    const t = title || M.title;
    const size = t.length > 22 ? 70 : 84;
    const lines = twoLines(ctx, t, size, colW);
    lines.forEach((ln, i) => U.text(ctx, ln, cx, 316 + i * (size + 8), { size, color: C.cream, font: FONT.serif, align: 'center', maxWidth: colW + 40 }));
    let y = 316 + (lines.length - 1) * (size + 8) + 52;

    const icon = (cy0) => {
        if (M.icon === 'heart') heart(ctx, cx, cy0, 30, C.rose);
        else if (M.icon === 'rings') rings(ctx, cx, cy0 + 2, 64, C.gold);
        else if (M.icon === 'house') house(ctx, cx, cy0 + 2, 62, C.gold);
        else diamond(ctx, cx, cy0, 26, M.accent);
    };
    K.hairline(ctx, cx - 190, y, cx - 40, y, U.rgba(M.accent, 0.5));
    K.hairline(ctx, cx + 40, y, cx + 190, y, U.rgba(M.accent, 0.5));
    icon(y);
    y += 62;
    if (sub) {
        ctx.font = `29px "${FONT.regular}"`;
        const words = String(sub).split(' '); const ls = []; let cur = '';
        for (const wd of words) { const tt = cur ? `${cur} ${wd}` : wd; if (ctx.measureText(tt).width > colW && cur) { ls.push(cur); cur = wd; } else cur = tt; }
        if (cur) ls.push(cur);
        ls.slice(0, 3).forEach((ln, i) => U.text(ctx, ln, cx, y + i * 40, { size: 29, color: C.muted, align: 'center', font: FONT.regular, maxWidth: colW + 40 }));
    }
    if (footer) K.label(ctx, footer, cx, h - 76, { color: C.muted, size: 15, spacing: 4, align: 'center', maxWidth: 1100 });
    return png(canvas);
}

/* ── profile card ───────────────────────────────────────────────────── */

/**
 * user / partner / parents[] / children[] / siblings[] are { name, avatar } objects.
 */
async function profileCard({ user, partner = null, marriedAt = null, parents = [], children = [], siblings = [], size = 1, limit = 5, premium = false, botName = 'family' } = {}) {
    const { canvas, ctx, w, h } = make(1774, 887);
    backdrop(ctx, w, h, { glowA: C.rose });
    const [ui, pi, parImgs, kidImgs] = await Promise.all([
        img(user?.avatar), img(partner?.avatar),
        Promise.all(parents.map((p) => img(p.avatar))), Promise.all(children.slice(0, 7).map((c) => img(c.avatar))),
    ]);

    // portrait on the left, identity on the right
    const px = 118, py = 100, pw = 270, ph = 370;
    K.archPortrait(ctx, ui, px, py, pw, ph, { label: user?.name, ring: C.rose, fill: C.panel2, frameGap: 12 });
    const X = 500, RW = w - 118 - X;
    K.label(ctx, 'family profile', X, 128, { color: C.rose, size: 18, spacing: 8 });
    if (premium) {
        const t = `Premium  ·  ${limit} children`;
        const tw = U.measure(ctx, t, 16, FONT.regular, 4) + 44;
        K.label(ctx, t, w - 118 - tw / 2, 129, { color: C.gold, size: 16, spacing: 4, align: 'center' });
    }
    U.text(ctx, user?.name || 'Unknown', X, 252, { size: 118, color: C.cream, font: FONT.serif, maxWidth: RW });

    // status line: plain words with small diamonds between
    const bits = [partner ? `Married to ${partner.name}` : 'Single'];
    if (parents.length) bits.push(`Child of ${parents.map((p) => p.name).join(' & ')}`);
    let sx = X;
    bits.forEach((t, i) => {
        if (i) { spark(ctx, sx + 22, 313, 22, C.gold); sx += 44; }
        U.text(ctx, t, sx, 324, { size: 29, color: C.soft, font: FONT.regular, maxWidth: (RW - 60) / bits.length });
        sx += Math.min(U.measure(ctx, t, 29, FONT.regular), (RW - 60) / bits.length);
    });
    K.hairline(ctx, X, 362, X + RW, 362, 'rgba(255,255,255,0.12)');

    // four figures, split by hairlines
    const tiles = [
        ['Children', `${children.length}`, `of ${limit}`],
        ['Siblings', `${siblings.length}`, ''],
        ['Family size', `${size}`, size === 1 ? 'member' : 'members'],
        [partner ? 'Together for' : 'Status', partner && marriedAt ? ago(marriedAt) : 'Single', ''],
    ];
    const cw = RW / 4;
    tiles.forEach(([label, value, note], i) => {
        const x = X + i * cw + (i ? 28 : 0);
        if (i) K.hairline(ctx, X + i * cw, 392, X + i * cw, 492, 'rgba(255,255,255,0.1)');
        K.label(ctx, label, x, 410, { color: C.muted, size: 15, spacing: 5, maxWidth: cw - 40 });
        const vs = Math.min(64, Math.floor((cw - 56) / Math.max(2.2, value.length * 0.5)));
        const vw = U.text(ctx, value, x, 482, { size: vs, color: C.cream, font: FONT.serif, maxWidth: cw - 50 });
        if (note) U.text(ctx, note, x + vw + 10, 482, { size: 20, color: C.muted, font: FONT.regular, maxWidth: Math.max(40, cw - 60 - vw) });
    });

    // family band: three open columns under a hairline
    const by = 560;
    K.hairline(ctx, 118, by, w - 118, by, 'rgba(255,255,255,0.12)');
    const colX = [118, 118 + 360, 118 + 360 + 480];
    const heads = ['Partner', 'Parents', 'Children'];
    colX.forEach((x, i) => {
        K.label(ctx, heads[i], x, by + 46, { color: C.gold, size: 15, spacing: 6 });
        if (i) K.hairline(ctx, x - 30, by + 22, x - 30, h - 96, 'rgba(255,255,255,0.1)');
    });
    const person = (img0, p, cx0, cy0, r) => {
        avatar(ctx, img0, cx0, cy0, r, p.name, { ring: C.line, gap: 6 });
        U.text(ctx, p.name, cx0, cy0 + r + 40, { size: 21, color: C.soft, align: 'center', font: FONT.regular, maxWidth: r * 2 + 44 });
    };
    const none = (x, t) => U.text(ctx, t, x, by + 150, { size: 25, color: C.muted, font: FONT.regular });
    const cy0 = by + 126, r0 = 44;
    partner ? person(pi, partner, colX[0] + 56, cy0, r0) : none(colX[0], 'No partner');
    parents.length ? parents.slice(0, 2).forEach((p, i) => person(parImgs[i], p, colX[1] + 56 + i * 150, cy0, r0)) : none(colX[1], 'No parents');
    if (children.length) {
        children.slice(0, 7).forEach((c, i) => person(kidImgs[i], c, colX[2] + 56 + i * 126, cy0, r0));
        if (children.length > 7) U.text(ctx, `+${children.length - 7}`, colX[2] + 56 + 7 * 126 - 40, cy0 + 12, { size: 34, color: C.gold, font: FONT.serif });
    } else none(colX[2], 'No children yet');
    return png(canvas);
}

/* ── family tree ────────────────────────────────────────────────────── */

const NODE_W = 190, COUPLE_GAP = 70, SIB_GAP = 46, LEVEL_H = 320, AV_R = 62, TREE_MAX_W = 3000;

function buildTree(S, target) {
    let top = target;
    for (let i = 0; i < 2; i++) { const p = (S.parents.get(top) || [])[0]; if (!p) break; top = p; }
    const seen = new Set();
    const unit = (x, depth) => {
        if (seen.has(x)) return null;
        const sp = S.spouse.get(x) || null;
        seen.add(x); if (sp) seen.add(sp);
        const kidIds = [...new Set([...(S.children.get(x) || []), ...(sp ? S.children.get(sp) || [] : [])])];
        const kids = depth >= 4 ? [] : kidIds.map((k) => unit(k, depth + 1)).filter(Boolean);
        return { members: sp ? [x, sp] : [x], kids, hidden: depth >= 4 ? kidIds.length : 0 };
    };
    return unit(top, 0);
}

const unitW = (u) => u.members.length * NODE_W + (u.members.length - 1) * COUPLE_GAP;
function measureTree(u) {
    u.kids.forEach(measureTree);
    const kw = u.kids.length ? u.kids.reduce((a, k) => a + k.w, 0) + (u.kids.length - 1) * SIB_GAP : 0;
    u.w = Math.max(unitW(u), kw);
    u.depth = 1 + (u.kids.length ? Math.max(...u.kids.map((k) => k.depth)) : 0);
}
function placeTree(u, left, level) {
    u.cx = left + u.w / 2; u.level = level;
    const kw = u.kids.length ? u.kids.reduce((a, k) => a + k.w, 0) + (u.kids.length - 1) * SIB_GAP : 0;
    let x = left + (u.w - kw) / 2;
    for (const k of u.kids) { placeTree(k, x, level + 1); x += k.w + SIB_GAP; }
}
function flatten(u, out = []) { out.push(u); u.kids.forEach((k) => flatten(k, out)); return out; }

/**
 * S = engine snapshot, users = Map(id → { name, avatar }), target = focus id, title = e.g. "cosmin's Family"
 */
async function treeCard({ S, users, target, title = 'Family Tree' } = {}) {
    const root = buildTree(S, target);
    measureTree(root);
    const margin = 130, head = 270;
    const W = Math.max(1500, Math.ceil(root.w + margin * 2));
    const H = head + root.depth * LEVEL_H + 40;
    placeTree(root, (W - root.w) / 2, 0);
    const all = flatten(root);

    const ids = [...new Set(all.flatMap((u) => u.members))];
    const imgs = new Map(await Promise.all(ids.map(async (id) => [id, await img(users.get(id)?.avatar)])));

    const { canvas, ctx } = make(W, H);
    backdrop(ctx, W, H, { seed: `tree:${target}` });

    // header
    K.label(ctx, 'family tree', 120, 112, { color: C.rose, size: 18, spacing: 8 });
    U.text(ctx, title, 116, 214, { size: 100, color: C.cream, font: FONT.serif, maxWidth: W - 560 });
    const count = `${S.people.size}${S.truncated ? '+' : ''} member${S.people.size === 1 ? '' : 's'}`;
    pill(ctx, W - 120 - (U.measure(ctx, count, 26, FONT.regular) + 60), 140, 56, count, { size: 26, dot: C.gold, border: U.rgba(C.gold, 0.5) });
    K.hairline(ctx, 120, 246, W - 120, 246, 'rgba(255,255,255,0.1)');

    const yOf = (level) => head + 90 + level * LEVEL_H;
    const slotX = (u, i) => u.cx - unitW(u) / 2 + NODE_W / 2 + i * (NODE_W + COUPLE_GAP);

    // connectors
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const u of all) {
        const y = yOf(u.level);
        if (u.members.length === 2) {
            const a = slotX(u, 0), b = slotX(u, 1);
            ctx.strokeStyle = U.rgba(C.rose, 0.55); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(a + AV_R + 18, y); ctx.lineTo(b - AV_R - 18, y); ctx.stroke();
            heart(ctx, (a + b) / 2, y, 11, C.rose);
        }
        if (u.kids.length) {
            const busY = y + LEVEL_H - AV_R - 62;
            ctx.strokeStyle = U.rgba(C.gold, 0.45); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(u.cx, y + (u.members.length === 2 ? 6 : AV_R + 74)); ctx.lineTo(u.cx, busY); ctx.stroke();
            const xs = u.kids.map((k) => k.cx);
            ctx.beginPath(); ctx.moveTo(Math.min(...xs, u.cx), busY); ctx.lineTo(Math.max(...xs, u.cx), busY); ctx.stroke();
            for (const k of u.kids) {
                const ky = yOf(k.level);
                ctx.beginPath(); ctx.moveTo(k.cx, busY); ctx.lineTo(k.cx, ky - (k.members.length === 2 ? 24 : AV_R + 22)); ctx.stroke();
            }
        }
        if (u.hidden) U.text(ctx, `+${u.hidden} more below`, u.cx, y + AV_R + 100, { size: 22, color: C.muted, align: 'center', font: FONT.regular });
    }

    // people
    for (const u of all) {
        const y = yOf(u.level);
        u.members.forEach((id, i) => {
            const x = slotX(u, i);
            const me = id === target;
            const rel = me ? null : R.relate(S, target, id);
            avatar(ctx, imgs.get(id), x, y, AV_R, users.get(id)?.name || '?', { ring: me ? C.rose : C.gold, ringW: me ? 3 : 2, gap: me ? 10 : 8 });
            U.text(ctx, users.get(id)?.name || 'Unknown', x, y + AV_R + 52, { size: 28, color: C.cream, font: FONT.serif, align: 'center', maxWidth: NODE_W + 20 });
            eyebrow(ctx, me ? 'Selected' : (rel?.label || ''), x, y + AV_R + 80, { color: me ? C.rose : C.muted, size: 15, spacing: 3, align: 'center', maxWidth: NODE_W + 20 });
        });
    }

    // keep Discord happy: very wide trees are scaled down
    if (W <= TREE_MAX_W) return png(canvas);
    const k = TREE_MAX_W / W;
    const out = createCanvas(TREE_MAX_W, Math.round(H * k));
    const octx = out.getContext('2d');
    octx.drawImage(canvas, 0, 0, out.width, out.height);
    return png(out);
}

module.exports = { pairCard, profileCard, treeCard, buildTree, fmtDate, ago };
