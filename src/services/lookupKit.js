// grace · small formatting helpers shared by the ip / domain / lookup commands.

const ui = require('./ui');
const { icon, pre } = require('./icons');

const NO = { parse: [] };
const clip = (s, n) => (s && String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));
const code = (v) => `\`${String(v).replace(/`/g, "'")}\``;
const unix = (d) => Math.floor(new Date(d).getTime() / 1000);
const when = (d) => { const t = unix(d); return Number.isFinite(t) ? `<t:${t}:D> (<t:${t}:R>)` : null; };
const ago = (d) => { const t = unix(d); return Number.isFinite(t) ? `<t:${t}:R>` : ''; };
const num = (n) => Number(n).toLocaleString('en');

/** "**Label:** `value`", or null when there is nothing to show. */
const kv = (label, value, { plain = false } = {}) => (value === null || value === undefined || value === '' ? null : `**${label}:** ${plain ? value : code(value)}`);

/** A titled group of lines, quoted like a small block. */
const group = (heading, lines) => {
  const ls = lines.filter(Boolean);
  return ls.length ? `**${heading}**\n${ls.map(l => `> ${l}`).join('\n')}` : null;
};

/**
 * One result card.
 *   title   heading text (an icon key can be passed as `iconKey`)
 *   about   the line under the heading, e.g. "Results for `example.com`"
 *   groups  array of strings from group()
 *   footer  small print (the data source)
 */
function card({ title, iconKey, about, groups, footer, thumb, rows = [] }) {
  const c = ui.box('base');
  const head = `### ${iconKey ? pre(iconKey) : ''}${title}${about ? `\n-# ${about}` : ''}`;
  c.addSectionComponents(ui.section(head, thumb));
  const body = groups.filter(Boolean);
  if (body.length) { c.addSeparatorComponents(ui.sep()); c.addTextDisplayComponents(ui.text(body.join('\n\n'))); }
  for (const r of rows) c.addActionRowComponents(r);
  if (footer) c.addTextDisplayComponents(ui.text(ui.sub(footer)));
  return c;
}

const note = (kind, text, footer) => ui.notice(kind, text, footer ? { footer } : {});
const send = (ctx, comps) => ui.send(ctx, comps, { extra: { allowedMentions: NO } });
const isSlash = (ctx) => !!ctx.isChatInputCommand?.();
const userOf = (ctx) => ctx.user ?? ctx.author;

/** Per-user cooldown for the heavier checks (ports, ping, ssl...). Returns seconds left, or 0. */
const waits = new Map();
function cooldown(key, userId, seconds) {
  const k = `${key}:${userId}`, now = Date.now(), until = waits.get(k) ?? 0;
  if (until > now) return Math.ceil((until - now) / 1000);
  waits.set(k, now + seconds * 1000);
  return 0;
}

module.exports = { NO, clip, code, when, ago, num, unix, kv, group, card, note, send, isSlash, userOf, cooldown, icon, pre, ui };
