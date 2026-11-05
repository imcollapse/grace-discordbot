// grace · vanity invite checks and the watcher that tells people when a code frees up.
// Uses Discord's public invite lookup, so no login and no user token are involved.

const db = require('../database/lookup');
const ui = require('./ui');
const { LookupError } = require('./netTools');

const CODE_RE = /^[a-z0-9-]{2,32}$/i;
const API = 'https://discord.com/api/v10/invites/';

function clean(input) {
  const s = String(input ?? '').trim().replace(/^(https?:\/\/)?(www\.)?(discord\.gg|discord(app)?\.com\/invite)\//i, '').replace(/^\/+|\/+$/g, '').split(/[/?#\s]/)[0];
  if (!CODE_RE.test(s)) throw new LookupError('A vanity code is 2 to 32 letters, numbers or hyphens, like `grace`.');
  return s.toLowerCase();
}

/** @returns { state: 'taken'|'invite'|'free', guild?, members?, online? } */
async function check(code) {
  const res = await fetch(`${API}${encodeURIComponent(code)}?with_counts=true`, { headers: { 'user-agent': 'grace-bot/1.0' } }).catch(() => null);
  if (!res) throw new LookupError('Could not reach Discord. Try again in a moment.');
  if (res.status === 404) return { state: 'free' };
  if (res.status === 429) { const j = await res.json().catch(() => ({})); throw new LookupError(`Discord asked us to slow down. Try again in ${Math.ceil(j.retry_after ?? 5)}s.`); }
  if (!res.ok) throw new LookupError('Discord did not answer that lookup.');
  const d = await res.json();
  const g = d.guild ?? {};
  return {
    state: g.vanity_url_code && g.vanity_url_code.toLowerCase() === code ? 'taken' : 'invite',
    guild: { id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null, description: g.description, features: g.features ?? [] },
    members: d.approximate_member_count ?? null, online: d.approximate_presence_count ?? null,
  };
}

/* ── watcher ───────────────────────────────────────────────────────── */

let timer = null;
async function sweep(client) {
  const rows = await db.watchAll();
  const byCode = new Map();
  for (const r of rows) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r.user_id]);
  for (const [code, users] of byCode) {
    let r;
    try { r = await check(code); } catch (e) { if (/slow down/.test(e.message)) return; continue; }
    if (r.state === 'taken') continue;
    if (r.state === 'free') {
      await db.drop('vanity', code, 'watch').catch(() => {});
      for (const id of users) {
        const u = await client.users.fetch(id).catch(() => null);
        const c = ui.box('base').addTextDisplayComponents(ui.text(`### Vanity available\n\`${code}\` is not used by any server right now. Claim it fast if you want it.\n${ui.sub('discord.gg/' + code)}`));
        await u?.send({ components: [c], flags: require('discord.js').MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }).catch(() => {});
      }
      await db.watchClear(code);
    }
    await new Promise(r2 => setTimeout(r2, 1500));
  }
}

function startWatcher(client) {
  if (timer) return;
  timer = setInterval(() => sweep(client).catch(e => console.error('[vanity watch]', e.message)), 3 * 60 * 1000);
  timer.unref?.();
}

module.exports = { clean, check, startWatcher, CODE_RE };
