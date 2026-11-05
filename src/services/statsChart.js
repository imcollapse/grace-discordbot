// grace · server + member analytics cards.
// Flat dark page, no frame. Plain sans type (Noto Sans). Rounded tiles for the numbers, bar charts per day.

const { createCanvas, loadImage } = require('@napi-rs/canvas');

const U = require('./cardArt');
const K = require('./cardKit');
function ensureFonts() { U.registerFonts(); }
const REG = `"${U.FONT.regular}", sans-serif`;
const BOLD = `"${U.FONT.bold}", "${U.FONT.regular}", sans-serif`;

const COLORS = {
    tint: '#1d2619', tile: 'rgba(255,255,255,0.05)', tile2: 'rgba(255,255,255,0.09)', line: 'rgba(255,255,255,0.14)',
    text: '#eef0e8', soft: 'rgba(238,240,232,0.7)', faint: 'rgba(238,240,232,0.46)',
    messages: '#a5c4f2', reactions: '#f3dc9a', voice: '#cdb9fa', joins: '#b2d8a2', leaves: '#feb7c9',
};

const W = 1000, M = 40, GAP = 12, TOP = 78;

/* ---------- formatting ---------- */

function formatNumber(n) {
    n = Number(n) || 0;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`.replace('.0k', 'k');
    return String(n);
}
const formatHours = (seconds) => (seconds / 3600).toFixed(2);
function formatDuration(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
    if (h >= 100) return `${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
}
function dateLabel(dateStr) {
    return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
const perDay = (total, days) => Math.round((total / Math.max(days, 1)) * 10) / 10;

/* ---------- drawing bits ---------- */

function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function tile(ctx, x, y, w, h, fill = COLORS.tile) {
    rr(ctx, x, y, w, h, 10); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.stroke();
}

function T(ctx, str, x, y, { size = 14, bold = false, color = COLORS.text, align = 'left', maxWidth, caps = false } = {}) {
    str = String(str ?? '');
    if (caps) str = str.toUpperCase();
    try { ctx.letterSpacing = caps ? '1.2px' : '0px'; } catch { /* older builds */ }
    let s = size;
    const set = () => { ctx.font = `${s}px ${bold ? BOLD : REG}`; };
    set();
    if (maxWidth) while (ctx.measureText(str).width > maxWidth && s > 9) { s -= 1; set(); }
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
    return ctx.measureText(str).width;
}
const measure = (ctx, str, size, bold) => { ctx.font = `${size}px ${bold ? BOLD : REG}`; return ctx.measureText(String(str)).width; };

async function image(url) { if (!url) return null; try { return await loadImage(url); } catch { return null; } }
function circle(ctx, img, x, y, d, fallbackText) {
    ctx.save(); ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); ctx.clip();
    if (img) ctx.drawImage(img, x, y, d, d);
    else { ctx.fillStyle = COLORS.tile2; ctx.fillRect(x, y, d, d); T(ctx, String(fallbackText || '?').slice(0, 1).toUpperCase(), x + d / 2, y + d / 2 + d * 0.17, { size: d * 0.5, bold: true, color: COLORS.soft, align: 'center' }); }
    ctx.restore();
}

function canvasFor(height) {
    ensureFonts();
    const canvas = createCanvas(W, height);
    return { canvas, ctx: canvas.getContext('2d') };
}

/* ---------- blocks ---------- */

/** Round picture, name, one-line subtitle, and up to three figures on the right. */
async function header(ctx, { y, avatarUrl, title, sub, figures = [] }) {
    const h = 84;
    tile(ctx, M, y, W - M * 2, h);
    const img = await image(avatarUrl);
    circle(ctx, img, M + 20, y + 16, 52, title);
    T(ctx, title, M + 88, y + 40, { size: 22, bold: true, maxWidth: W - M * 2 - 88 - 120 - figures.length * 110 });
    T(ctx, sub, M + 88, y + 62, { size: 10, caps: true, color: COLORS.soft, maxWidth: W - M * 2 - 88 - 40 - figures.length * 110 });
    let rx = W - M - 28;
    for (let i = figures.length - 1; i >= 0; i--) {
        const f = figures[i];
        const w = Math.max(measure(ctx, f.value, 22, true), measure(ctx, f.label, 12, false), 54);
        T(ctx, f.value, rx - w / 2, y + 40, { size: 22, bold: true, align: 'center' });
        T(ctx, f.label, rx - w / 2, y + 60, { size: 10, color: COLORS.faint, align: 'center', caps: true });
        rx -= w + 34;
    }
    return y + h + GAP;
}

/** A row of number tiles: [{ label, value, sub, color }] */
function tiles(ctx, y, items) {
    const h = 104, w = (W - M * 2 - GAP * (items.length - 1)) / items.length;
    items.forEach((it, i) => {
        const x = M + i * (w + GAP);
        tile(ctx, x, y, w, h);
        if (it.color) { ctx.beginPath(); ctx.arc(x + 22, y + 26, 4, 0, Math.PI * 2); ctx.fillStyle = it.color; ctx.fill(); }
        T(ctx, it.label, x + (it.color ? 34 : 20), y + 31, { size: 11, color: COLORS.soft, maxWidth: w - 50, caps: true });
        T(ctx, it.value, x + 20, y + 71, { size: 34, bold: true, maxWidth: w - 40 });
        T(ctx, it.sub ?? '', x + 20, y + 92, { size: 10, color: COLORS.faint, maxWidth: w - 40, caps: true });
    });
    return y + h + GAP;
}

/**
 * Per-day bars. `bars` = [{ date, value }]. Optional second series `bars2` is drawn beside each bar.
 * Draws its own tile. `format` writes the numbers on the scale.
 */
function barChart(ctx, { x, y, w, h, title, note = '', bars, bars2, color, color2, format = formatNumber, empty = 'No tracked activity yet', legend }) {
    tile(ctx, x, y, w, h);
    T(ctx, title, x + 20, y + 31, { size: 12, color: COLORS.text, caps: true });
    if (note) T(ctx, note, x + w - 20, y + 31, { size: 10, color: COLORS.soft, align: 'right', caps: true });
    if (legend) {
        let lx = x + 20; const ly = y + 54;
        for (const l of legend) {
            ctx.beginPath(); ctx.arc(lx + 4, ly - 4, 4, 0, Math.PI * 2); ctx.fillStyle = l.color; ctx.fill();
            lx += 14 + T(ctx, l.label, lx + 14, ly, { size: 10, color: COLORS.soft, caps: true }) + 14;
        }
    }
    const left = x + 60, right = x + w - 20, top = y + (legend ? 74 : 58), bottom = y + h - 38;
    const ph = bottom - top, pw = right - left;
    const all = [...bars.map(b => b.value), ...(bars2 ?? []).map(b => b.value)];
    const max = Math.max(...all, 0);

    for (let i = 0; i <= 3; i++) {
        const gy = top + (ph * i) / 3;
        ctx.strokeStyle = i === 3 ? '#2a2e36' : '#14171b'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, gy); ctx.lineTo(right, gy); ctx.stroke();
        if (max > 0) T(ctx, format(Math.round(max * (1 - i / 3))), left - 8, gy + 4, { size: 11, color: COLORS.faint, align: 'right' });
    }
    if (max === 0) {
        T(ctx, empty, (left + right) / 2, (top + bottom) / 2 + 4, { size: 13, color: COLORS.faint, align: 'center' });
    } else {
        const n = bars.length, slot = pw / n, groups = bars2 ? 2 : 1;
        const bw = Math.max(2, Math.min(18, (slot * 0.62) / groups));
        const bar = (cx, v, col) => {
            const bh = Math.max(v > 0 ? 3 : 1.5, (v / max) * ph);
            rr(ctx, cx, bottom - bh, bw, bh, Math.min(4, bw / 2));
            ctx.fillStyle = v > 0 ? col : '#23262d'; ctx.fill();
        };
        for (let i = 0; i < n; i++) {
            const gx = left + i * slot + (slot - bw * groups - (groups - 1) * 2) / 2;
            bar(gx, bars[i].value, color);
            if (bars2) bar(gx + bw + 2, bars2[i].value, color2);
        }
    }
    const n = bars.length;
    const at = (i, align) => T(ctx, dateLabel(bars[i].date), align === 'left' ? left : align === 'right' ? right : (left + right) / 2, bottom + 22, { size: 10, color: COLORS.faint, align, caps: true });
    if (n) { at(0, 'left'); if (n > 4) at(Math.floor((n - 1) / 2), 'center'); at(n - 1, 'right'); }
}

/** Ranked list tile: [{ name, value }] with a thin share bar under each row. */
function listTile(ctx, { x, y, w, h, title, note = '', items, color, empty = 'Nothing yet' }) {
    tile(ctx, x, y, w, h);
    T(ctx, title, x + 20, y + 31, { size: 12, color: COLORS.text, caps: true });
    if (note) T(ctx, note, x + w - 20, y + 31, { size: 10, color: COLORS.soft, align: 'right', caps: true });
    if (!items.length) { T(ctx, empty, x + w / 2, y + h / 2 + 18, { size: 13, color: COLORS.faint, align: 'center' }); return; }
    const top = y + 52, rowH = Math.min(46, (h - 64) / items.length);
    const max = Math.max(...items.map(i => i.raw ?? 0), 1);
    items.forEach((it, i) => {
        const ry = top + i * rowH, base = ry + 20;
        T(ctx, String(i + 1), x + 20, base, { size: 13, color: i === 0 ? color : COLORS.faint, bold: i === 0 });
        const vw = T(ctx, it.value, x + w - 20, base, { size: 14, bold: true, align: 'right' });
        T(ctx, it.name, x + 44, base, { size: 14, maxWidth: w - 44 - 28 - vw });
        const bx = x + 44, bw = w - 64;
        rr(ctx, bx, ry + 29, bw, 3, 1.5); ctx.fillStyle = '#1a1d22'; ctx.fill();
        rr(ctx, bx, ry + 29, Math.max(3, bw * ((it.raw ?? 0) / max)), 3, 1.5); ctx.fillStyle = color; ctx.fill();
    });
}

async function footer(ctx, y, { botName, botAvatarURL, rangeLabel, note }) {
    const img = await image(botAvatarURL);
    circle(ctx, img, M + 4, y, 44, botName);
    const nw = T(ctx, botName, M + 60, y + 22, { size: 15, bold: true, color: COLORS.soft });
    T(ctx, `${rangeLabel} / utc${note ? ` / ${note}` : ''}`, M + 60, y + 40, { size: 10, color: COLORS.faint, caps: true });
    return y + 52;
}

const seriesBars = (series, key) => series.map(p => ({ date: p.date, value: p[key] }));
const sum = (series, key) => series.reduce((s, p) => s + p[key], 0);
const busiest = (series, key) => series.reduce((b, p) => (p[key] > (b?.[key] ?? 0) ? p : b), null);
const finish = (canvas, ctx, y) => {
    // lay the content on the tinted page, sized to the content
    const h = y + 48;
    const out = createCanvas(W, h), g = out.getContext('2d');
    K.page(g, W, h, { top: '#000000', bottom: '#000000', glow: false, tagLeft: 'grace / stats' });
    g.drawImage(canvas, 0, 0);
    return out.toBuffer('image/png');
};
const BIG = 1400;
const listH = (...lists) => 76 + 46 * Math.max(2, ...lists.map(l => l.length));

/* ---------- cards ---------- */

async function renderOverviewCard(o) {
    const { canvas, ctx } = canvasFor(BIG);
    let y = TOP;
    y = await header(ctx, {
        y, avatarUrl: o.guildIconURL, title: o.guildName, sub: `Server overview  ·  ${o.rangeLabel}`,
        figures: [{ value: formatNumber(o.memberCount), label: 'Members' }, { value: o.createdAt, label: 'Created' }],
    });
    y = tiles(ctx, y, [
        { label: 'Messages', value: formatNumber(o.totals.messages), sub: `${perDay(o.totals.messages, o.days)} a day`, color: COLORS.messages },
        { label: 'Voice time', value: formatDuration(o.totals.voiceSeconds), sub: `${formatDuration(o.totals.voiceSeconds / Math.max(o.days, 1))} a day`, color: COLORS.voice },
        { label: 'Reactions', value: formatNumber(o.totals.reactions), sub: `${perDay(o.totals.reactions, o.days)} a day`, color: COLORS.reactions },
        { label: 'Member growth', value: `${o.totals.joins - o.totals.leaves >= 0 ? '+' : ''}${o.totals.joins - o.totals.leaves}`, sub: `${o.totals.joins} joined · ${o.totals.leaves} left`, color: COLORS.joins },
    ]);
    const half = (W - M * 2 - GAP) / 2;
    const ch = 250;
    barChart(ctx, { x: M, y, w: half, h: ch, title: 'Messages per day', note: `avg ${perDay(sum(o.series, 'messages'), o.series.length)} a day`, bars: seriesBars(o.series, 'messages'), color: COLORS.messages });
    barChart(ctx, { x: M + half + GAP, y, w: half, h: ch, title: 'Voice per day', note: `avg ${formatDuration(sum(o.series, 'voiceSeconds') / Math.max(o.series.length, 1))} a day`, bars: seriesBars(o.series, 'voiceSeconds'), color: COLORS.voice, format: formatDuration, empty: 'No tracked voice time yet' });
    y += ch + GAP;
    const lh = listH(o.topChannels, o.topMembers);
    listTile(ctx, { x: M, y, w: half, h: lh, title: 'Top channels', note: o.rangeLabel, items: o.topChannels, color: COLORS.messages, empty: 'No messages tracked yet' });
    listTile(ctx, { x: M + half + GAP, y, w: half, h: lh, title: 'Top members', note: o.rangeLabel, items: o.topMembers, color: COLORS.voice, empty: 'No messages tracked yet' });
    y = await footer(ctx, y + lh + 10, o);
    return finish(canvas, ctx, y + 4);
}

async function renderActivityCard(o) {
    const { canvas, ctx } = canvasFor(BIG);
    let y = TOP;
    y = await header(ctx, {
        y, avatarUrl: o.guildIconURL, title: o.guildName, sub: `Activity  ·  ${o.rangeLabel}`,
        figures: [{ value: formatNumber(o.memberCount), label: 'Members' }],
    });
    const mb = busiest(o.series, 'messages'), vb = busiest(o.series, 'voiceSeconds');
    y = tiles(ctx, y, [
        { label: 'Messages', value: formatNumber(sum(o.series, 'messages')), sub: mb ? `busiest ${dateLabel(mb.date)}` : 'no data yet', color: COLORS.messages },
        { label: 'Voice time', value: formatDuration(sum(o.series, 'voiceSeconds')), sub: vb ? `busiest ${dateLabel(vb.date)}` : 'no data yet', color: COLORS.voice },
        { label: 'Reactions', value: formatNumber(sum(o.series, 'reactions')), sub: 'across the server', color: COLORS.reactions },
    ]);
    const full = W - M * 2;
    barChart(ctx, { x: M, y, w: full, h: 250, title: 'Messages per day', note: `avg ${perDay(sum(o.series, 'messages'), o.series.length)} a day`, bars: seriesBars(o.series, 'messages'), color: COLORS.messages });
    y += 250 + GAP;
    barChart(ctx, { x: M, y, w: full, h: 250, title: 'Voice per day', note: `avg ${formatDuration(sum(o.series, 'voiceSeconds') / Math.max(o.series.length, 1))} a day`, bars: seriesBars(o.series, 'voiceSeconds'), color: COLORS.voice, format: formatDuration, empty: 'No tracked voice time yet' });
    y = await footer(ctx, y + 260, o);
    return finish(canvas, ctx, y + 4);
}

async function renderMembershipCard(o) {
    const { canvas, ctx } = canvasFor(BIG);
    let y = TOP;
    const joins = sum(o.series, 'joins'), leaves = sum(o.series, 'leaves'), net = joins - leaves;
    y = await header(ctx, {
        y, avatarUrl: o.guildIconURL, title: o.guildName, sub: `Membership  ·  ${o.rangeLabel}`,
        figures: [{ value: formatNumber(o.memberCount), label: 'Members' }],
    });
    y = tiles(ctx, y, [
        { label: 'Joined', value: formatNumber(joins), sub: `${perDay(joins, o.series.length)} a day`, color: COLORS.joins },
        { label: 'Left', value: formatNumber(leaves), sub: `${perDay(leaves, o.series.length)} a day`, color: COLORS.leaves },
        { label: 'Net growth', value: `${net >= 0 ? '+' : ''}${net}`, sub: net >= 0 ? 'more joined than left' : 'more left than joined' },
        { label: 'Members now', value: formatNumber(o.memberCount), sub: `created ${o.createdAt}` },
    ]);
    barChart(ctx, {
        x: M, y, w: W - M * 2, h: 300, title: 'Joins and leaves per day', note: `${joins} joined · ${leaves} left`,
        bars: seriesBars(o.series, 'joins'), bars2: seriesBars(o.series, 'leaves'), color: COLORS.joins, color2: COLORS.leaves,
        legend: [{ label: 'Joined', color: COLORS.joins }, { label: 'Left', color: COLORS.leaves }], empty: 'No joins or leaves tracked yet',
    });
    y = await footer(ctx, y + 310, o);
    return finish(canvas, ctx, y + 4);
}

async function renderMessagesCard(o) {
    const { canvas, ctx } = canvasFor(BIG);
    let y = TOP;
    const total = sum(o.series, 'messages'), b = busiest(o.series, 'messages');
    y = await header(ctx, {
        y, avatarUrl: o.guildIconURL, title: o.guildName, sub: `Messages  ·  ${o.rangeLabel}`,
        figures: [{ value: formatNumber(o.memberCount), label: 'Members' }],
    });
    y = tiles(ctx, y, [
        { label: 'Messages', value: formatNumber(o.totals.messages), sub: o.rangeLabel, color: COLORS.messages },
        { label: 'Daily average', value: String(perDay(o.totals.messages, o.days)), sub: 'messages a day' },
        { label: 'Busiest day', value: b ? dateLabel(b.date) : '—', sub: b ? `${formatNumber(b.messages)} messages` : 'no data yet' },
        { label: 'Chatters', value: formatNumber(o.chatters ?? 0), sub: 'members who wrote' },
    ]);
    barChart(ctx, { x: M, y, w: W - M * 2, h: 250, title: 'Messages per day', note: `avg ${perDay(total, o.series.length)} a day`, bars: seriesBars(o.series, 'messages'), color: COLORS.messages });
    y += 250 + GAP;
    const half = (W - M * 2 - GAP) / 2, lh = listH(o.topMembers, o.topChannels);
    listTile(ctx, { x: M, y, w: half, h: lh, title: 'Top members', note: o.rangeLabel, items: o.topMembers, color: COLORS.voice, empty: 'No messages tracked yet' });
    listTile(ctx, { x: M + half + GAP, y, w: half, h: lh, title: 'Top channels', note: o.rangeLabel, items: o.topChannels, color: COLORS.messages, empty: 'No messages tracked yet' });
    y = await footer(ctx, y + lh + 10, o);
    return finish(canvas, ctx, y + 4);
}

async function renderVoiceCard(o) {
    const { canvas, ctx } = canvasFor(BIG);
    let y = TOP;
    const total = sum(o.series, 'voiceSeconds');
    y = await header(ctx, {
        y, avatarUrl: o.guildIconURL, title: o.guildName, sub: `Voice activity  ·  ${o.rangeLabel}`,
        figures: [{ value: formatNumber(o.memberCount), label: 'Members' }, { value: String(o.inVoice ?? 0), label: 'In voice now' }],
    });
    y = tiles(ctx, y, [
        { label: 'Voice time', value: formatDuration(o.totals.voiceSeconds), sub: `${formatDuration(o.totals.voiceSeconds / Math.max(o.days, 1))} a day`, color: COLORS.voice },
        { label: 'Members in voice', value: formatNumber(o.voiceMembers ?? 0), sub: o.rangeLabel },
        { label: 'Per member', value: formatDuration((o.totals.voiceSeconds) / Math.max(o.voiceMembers ?? 0, 1)), sub: 'on average' },
    ]);
    barChart(ctx, { x: M, y, w: W - M * 2, h: 250, title: 'Voice per day', note: `avg ${formatDuration(total / Math.max(o.series.length, 1))} a day`, bars: seriesBars(o.series, 'voiceSeconds'), color: COLORS.voice, format: formatDuration, empty: 'No tracked voice time yet' });
    y += 250 + GAP;
    listTile(ctx, { x: M, y, w: W - M * 2, h: listH(o.topVoice), title: 'Most time in voice', note: o.rangeLabel, items: o.topVoice, color: COLORS.voice, empty: 'No voice time tracked yet' });
    y = await footer(ctx, y + listH(o.topVoice) + 10, o);
    return finish(canvas, ctx, y + 4);
}

async function renderUserCard(o) {
    const { canvas, ctx } = canvasFor(BIG);
    let y = TOP;
    const rank = (r) => (r ? `#${r}` : '—');
    y = await header(ctx, {
        y, avatarUrl: o.avatarUrl, title: o.name, sub: `Member analytics  ·  ${o.rangeLabel}  ·  ID ${o.id}`,
        figures: [{ value: rank(o.messageRank), label: 'Message rank' }, { value: rank(o.voiceRank), label: 'Voice rank' }, { value: String(o.roles ?? 0), label: 'Roles' }],
    });
    y = tiles(ctx, y, [
        { label: 'Messages', value: formatNumber(o.messages), sub: `${perDay(o.messages, o.days)} a day`, color: COLORS.messages },
        { label: 'Voice time', value: formatDuration(o.voiceSeconds), sub: `${formatDuration(o.voiceSeconds / Math.max(o.days, 1))} a day`, color: COLORS.voice },
        { label: 'Active days', value: String(o.activeDays), sub: `of the last ${o.series.length}` },
        { label: 'Top channel', value: o.topChannels[0]?.name ?? '—', sub: o.topChannels[0] ? `${o.topChannels[0].value} messages` : 'no messages yet' },
    ]);
    const half = (W - M * 2 - GAP) / 2, ch = 250;
    barChart(ctx, { x: M, y, w: half, h: ch, title: 'Messages per day', note: `avg ${perDay(o.messages, o.days)} a day`, bars: seriesBars(o.series, 'messages'), color: COLORS.messages });
    barChart(ctx, { x: M + half + GAP, y, w: half, h: ch, title: 'Voice per day', note: `avg ${formatDuration(o.voiceSeconds / Math.max(o.days, 1))} a day`, bars: seriesBars(o.series, 'voiceSeconds'), color: COLORS.voice, format: formatDuration, empty: 'No tracked voice time yet' });
    y += ch + GAP;
    // snapshot strip
    const sh = 108;
    tile(ctx, M, y, W - M * 2, sh);
    T(ctx, 'Member snapshot', M + 20, y + 31, { size: 14, bold: true });
    T(ctx, o.rangeLabel, W - M - 20, y + 31, { size: 12, color: COLORS.soft, align: 'right' });
    const cells = o.snapshot;
    const cw = (W - M * 2 - 40) / cells.length;
    cells.forEach((c, i) => {
        const cx = M + 20 + cw * i + cw / 2;
        T(ctx, c.value, cx, y + 70, { size: 22, bold: true, align: 'center', maxWidth: cw - 16 });
        T(ctx, c.label, cx, y + 92, { size: 12, color: COLORS.faint, align: 'center' });
    });
    y += sh + 10;
    y = await footer(ctx, y, o);
    return finish(canvas, ctx, y + 4);
}

module.exports = {
    COLORS, formatNumber, formatHours, formatDuration, perDay,
    renderOverviewCard, renderActivityCard, renderMembershipCard, renderMessagesCard, renderVoiceCard, renderUserCard,
};
