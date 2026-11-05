// grace · shared pieces for the gaming and developer platform commands (prefix only).
//   makePlatform({ name, aliases, description, subs, fallback }) → a prefix command with sub-commands
//   card({...}) → the same clean container for every platform

const { MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder } = require('discord.js');
const ui = require('../ui');

const NO = { parse: [], repliedUser: false };
class PlatformError extends Error { constructor(m) { super(m); this.userFacing = true; } }

const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const num = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '-' : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n)));
const int = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-US'));
const when = (d, f = 'D') => { const t = d instanceof Date ? d : new Date(d); return Number.isNaN(t.getTime()) ? null : `<t:${Math.floor(t.getTime() / 1000)}:${f}>`; };
const strip = (html) => String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, '\'');

/** GET json (or text). 404 → `notFound` message; other failures → a friendly error. */
async function get(url, { json = true, notFound = 'I couldn\'t find that.', missing = [404], forbidden = 'That service refused the request. Try again later.', headers = {}, method = 'GET', body, timeout = 9000, okStatus = [] } = {}) {
    let res;
    try {
        res = await fetch(url, {
            method, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
            headers: { 'user-agent': 'grace-bot/2.0 (+https://discord.com)', accept: json ? 'application/json' : '*/*', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
        });
    } catch { throw new PlatformError('That service did not answer in time, try again in a moment.'); }
    if (missing.includes(res.status)) throw new PlatformError(notFound);
    if (okStatus.includes(res.status)) return null;
    if (res.status === 429) throw new PlatformError('That service is busy right now, try again in a minute.');
    if (res.status === 403) throw new PlatformError(forbidden);
    if (!res.ok) throw new PlatformError('That service returned an error, try again in a moment.');
    try { return json ? await res.json() : await res.text(); } catch { throw new PlatformError('That service sent something I could not read.'); }
}

/** One look for every platform: title, small lines, optional thumbnail, big picture and link buttons. */
function card({ title, url, thumb, lines = [], image, links = [], footer }) {
    const c = ui.box('base');
    const head = `## ${url ? `[${clip(title, 90)}](${url})` : clip(title, 90)}${lines.length ? `\n${lines.filter(Boolean).join('\n')}` : ''}`;
    c.addSectionComponents(ui.section(head, thumb));
    if (image) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image)));
    const btns = links.filter((l) => l && l.url).slice(0, 5).map((l) => ui.link(l.label, l.url));
    if (btns.length) c.addActionRowComponents(ui.row(btns));
    if (footer) c.addTextDisplayComponents(ui.text(ui.sub(footer)));
    return c;
}
/** A list card: a title and short lines. */
function list(title, rows, footer) {
    const c = ui.box('base').addTextDisplayComponents(ui.text(`## ${title}\n${rows.join('\n')}`));
    if (footer) c.addTextDisplayComponents(ui.text(ui.sub(footer)));
    return c;
}
const note = (kind, text, hint) => ui.notice(kind, text, hint ? { footer: hint } : {});
const reply = (m, comps, files) => ui.send(m, comps, { extra: { allowedMentions: NO, ...(files ? { files } : {}) } });
const file = (buf, name) => new AttachmentBuilder(buf, { name });
/** `**label** value` rows, dropping empty ones. */
const rows = (...pairs) => pairs.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false).map(([k, v]) => `> ${k} · **${v}**`);

const cooldown = new Map();

/**
 * subs: [{ name, aliases, desc, arg, run(message, arg) → container | [container, files] }]
 * `fallback`: sub-command used when the first word is not one (so `steam portal 2` works).
 */
function makePlatform({ name, aliases = [], description, subs, fallback = null }) {
    const by = new Map();
    for (const s of subs) { by.set(s.name, s); for (const a of s.aliases ?? []) by.set(a, s); }
    const usage = `${name} <${subs.map((s) => s.name).join('|')}>`;
    const helpCard = () => list(`${name}`, [
        ...subs.map((s) => `> \`${name} ${s.name}${s.arg ? ` <${s.arg}>` : ''}\` · ${s.desc}`),
    ], fallback ? `${by.get(fallback)?.arg ? `\`${name} <${by.get(fallback).arg}>\` works too` : ''}` : undefined);

    return {
        name, aliases, description, usage, category: 'platforms', dm: true,
        async execute(message, args = []) {
            const solo = fallback && !by.get(fallback)?.arg ? by.get(fallback) : null;
            if (!args.length && !solo) return reply(message, helpCard());
            let s = args.length ? by.get((args[0] || '').toLowerCase()) : solo, arg = args.slice(1).join(' ').trim();
            if (!s) { s = fallback ? by.get(fallback) : null; arg = args.join(' ').trim(); }
            if (!s) return reply(message, helpCard());
            if (s.arg && s.required !== false && !arg) return reply(message, note('warning', `${s.arg}?`, `Example: \`${name} ${s.name} ${s.example ?? '<' + s.arg + '>'}\``));
            const key = `${name}:${message.author.id}`;
            if (Date.now() - (cooldown.get(key) ?? 0) < 3000) return;
            cooldown.set(key, Date.now());
            message.channel?.sendTyping?.().catch(() => {});
            try {
                const out = await s.run(message, arg);
                if (!out) return;
                return Array.isArray(out) ? await reply(message, out[0], out[1]) : await reply(message, out);
            } catch (e) {
                if (!e?.userFacing) console.error(`[${name}]`, e);
                return reply(message, note('error', e?.userFacing ? e.message : 'Something went wrong while looking that up.')).catch(() => {});
            }
        },
    };
}

module.exports = { makePlatform, card, list, note, reply, rows, get, clip, num, int, when, strip, file, PlatformError };
