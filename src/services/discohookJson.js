// grace — Discohook JSON → a message the bot can send.
//
// Discohook gives three shapes of JSON:
//   • one message      { content, embeds, components, flags, ... }       (JSON Data Editor)
//   • a backup         { messages: [ { data: { ... } }, ... ] }
//   • a plain array    [ { ... }, { ... } ]
// All three are accepted. Anything a bot can't send is dropped and reported in `notes`:
//   • webhook-only fields (username, avatar_url, thread_name)
//   • files that only exist in the browser (attachment:// and blob: links)
//   • Discohook's own interactive buttons and select menus (the bot has no handler for them)
//   • link buttons keep working; their stray custom_id is removed

const V2_FLAG = 1 << 15;           // IsComponentsV2
const KEEP_FLAGS = V2_FLAG | (1 << 2) | (1 << 12); // + SuppressEmbeds, SuppressNotifications
const MAX_MESSAGES = 5;

const T = { ROW: 1, BUTTON: 2, SECTION: 9, TEXT: 10, THUMB: 11, GALLERY: 12, FILE: 13, SEP: 14, CONTAINER: 17 };
const V2_TYPES = new Set([T.SECTION, T.TEXT, T.THUMB, T.GALLERY, T.FILE, T.SEP, T.CONTAINER]);

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isLocal = (url) => typeof url !== 'string' || !/^https?:\/\//i.test(url); // attachment://, blob:, empty

class JsonError extends Error {}

/** Text → array of raw message objects. */
function parse(input) {
  let src = String(input ?? '').trim().replace(/^﻿/, '');
  const fence = src.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) src = fence[1];
  if (!src) throw new JsonError('Nothing to read, the JSON is empty');

  let data;
  try { data = JSON.parse(src); }
  catch (e) { throw new JsonError(`That isn't valid JSON (${e.message.slice(0, 80)})`); }

  let list;
  if (Array.isArray(data)) list = data;
  else if (isObj(data) && Array.isArray(data.messages)) list = data.messages;
  else if (isObj(data)) list = [data];
  else throw new JsonError('Expected a Discohook message object');

  list = list.map((m) => (isObj(m) && isObj(m.data) ? m.data : m)).filter(isObj);
  if (!list.length) throw new JsonError('I couldn\'t find a message in that JSON');
  if (list.length > MAX_MESSAGES) throw new JsonError(`Too many messages (${list.length}). The limit is ${MAX_MESSAGES} at a time`);
  return list;
}

/* ── components ────────────────────────────────────────────────────── */

function cleanButton(b, notes) {
  if (b.style === 5 && typeof b.url === 'string' && /^https?:\/\//i.test(b.url)) {
    const out = { type: T.BUTTON, style: 5, url: b.url };
    if (b.label) out.label = String(b.label).slice(0, 80);
    if (isObj(b.emoji) && (b.emoji.id || b.emoji.name)) out.emoji = { id: b.emoji.id, name: b.emoji.name, animated: !!b.emoji.animated };
    if (b.disabled) out.disabled = true;
    if (!out.label && !out.emoji) out.label = 'Link';
    return out;
  }
  notes.add('Removed buttons that need Discohook to run them. Only link buttons work through the bot');
  return null;
}

/** Returns an array of cleaned components (a section can turn into plain text). */
function cleanComponent(c, notes, depth = 0) {
  if (!isObj(c)) return [];
  switch (c.type) {
    case T.ROW: {
      const kids = (c.components ?? []).map((k) => (k?.type === T.BUTTON ? cleanButton(k, notes) : (notes.add('Removed select menus. The bot can\'t run them'), null))).filter(Boolean);
      return kids.length ? [{ type: T.ROW, components: kids.slice(0, 5) }] : [];
    }
    case T.TEXT:
      return c.content ? [{ type: T.TEXT, content: String(c.content) }] : [];
    case T.SECTION: {
      const texts = (c.components ?? []).flatMap((k) => cleanComponent(k, notes, depth + 1)).filter((k) => k.type === T.TEXT).slice(0, 3);
      const acc = c.accessory;
      let accessory = null;
      if (isObj(acc) && acc.type === T.BUTTON) accessory = cleanButton(acc, notes);
      else if (isObj(acc) && acc.type === T.THUMB) accessory = cleanComponent(acc, notes, depth + 1)[0] ?? null;
      if (!texts.length) return [];
      return accessory ? [{ type: T.SECTION, components: texts, accessory }] : texts; // no usable accessory → plain text
    }
    case T.THUMB: {
      const url = c.media?.url;
      if (isLocal(url)) { notes.add('Removed images that were uploaded inside Discohook. Use a direct image link (https://...) instead'); return []; }
      const out = { type: T.THUMB, media: { url } };
      if (c.description) out.description = String(c.description).slice(0, 1024);
      if (c.spoiler) out.spoiler = true;
      return [out];
    }
    case T.GALLERY: {
      const items = (c.items ?? []).filter((i) => {
        if (isLocal(i?.media?.url)) { notes.add('Removed images that were uploaded inside Discohook. Use a direct image link (https://...) instead'); return false; }
        return true;
      }).slice(0, 10).map((i) => ({ media: { url: i.media.url }, ...(i.description ? { description: String(i.description).slice(0, 1024) } : {}), ...(i.spoiler ? { spoiler: true } : {}) }));
      return items.length ? [{ type: T.GALLERY, items }] : [];
    }
    case T.FILE:
      notes.add('Removed file attachments. Files uploaded in Discohook can\'t be sent by the bot');
      return [];
    case T.SEP: {
      const out = { type: T.SEP };
      if (c.divider === false) out.divider = false;
      if (c.spacing === 2) out.spacing = 2;
      return [out];
    }
    case T.CONTAINER: {
      if (depth > 0) return [];
      const kids = (c.components ?? []).flatMap((k) => cleanComponent(k, notes, depth + 1));
      if (!kids.length) return [];
      const out = { type: T.CONTAINER, components: kids };
      if (c.spoiler) out.spoiler = true;
      return [out];
    }
    default:
      return [];
  }
}

/* ── embeds ────────────────────────────────────────────────────────── */

function cleanEmbed(e, notes) {
  if (!isObj(e)) return null;
  const out = { ...e };
  const strip = (obj, key) => {
    if (isObj(obj?.[key]) && isLocal(obj[key].url ?? obj[key].icon_url)) {
      notes.add('Removed images that were uploaded inside Discohook. Use a direct image link (https://...) instead');
      delete obj[key];
    }
  };
  for (const k of ['image', 'thumbnail']) if (isObj(out[k])) { out[k] = { ...out[k] }; strip(out, k); }
  for (const k of ['author', 'footer']) {
    if (!isObj(out[k])) continue;
    out[k] = { ...out[k] };
    if (out[k].icon_url && isLocal(out[k].icon_url)) { delete out[k].icon_url; notes.add('Removed images that were uploaded inside Discohook. Use a direct image link (https://...) instead'); }
  }
  delete out.type;
  const has = out.title || out.description || out.fields?.length || out.image || out.thumbnail || out.author || out.footer;
  return has ? out : null;
}

/* ── one message ───────────────────────────────────────────────────── */

/** Raw Discohook message → { payload, notes }. Throws JsonError when there is nothing to send. */
function toPayload(raw) {
  const notes = new Set();
  if (raw.username || raw.avatar_url || raw.thread_name) notes.add('Ignored the webhook name, avatar and thread name. The message is sent as the bot');

  let flags = (Number(raw.flags) || 0) & KEEP_FLAGS;
  const rawComps = Array.isArray(raw.components) ? raw.components : [];
  const v2 = !!(flags & V2_FLAG) || rawComps.some((c) => V2_TYPES.has(c?.type));
  if (v2) flags |= V2_FLAG;

  const components = rawComps.flatMap((c) => cleanComponent(c, notes));
  const payload = { allowedMentions: { parse: [] } };

  if (v2) {
    if (!components.length) throw new JsonError('There\'s nothing in that message I can send');
    payload.components = components.slice(0, 10);
    payload.flags = flags;
    if (raw.content || raw.embeds?.length) notes.add('Ignored content and embeds. A components message can\'t carry them');
  } else {
    const content = typeof raw.content === 'string' ? raw.content.slice(0, 2000) : '';
    const embeds = (Array.isArray(raw.embeds) ? raw.embeds : []).slice(0, 10).map((e) => cleanEmbed(e, notes)).filter(Boolean);
    const rows = components.filter((c) => c.type === T.ROW).slice(0, 5);
    if (!content && !embeds.length && !rows.length) throw new JsonError('There\'s nothing in that message I can send');
    if (content) payload.content = content;
    if (embeds.length) payload.embeds = embeds;
    if (rows.length) payload.components = rows;
    if (flags) payload.flags = flags;
  }
  return { payload, notes: [...notes] };
}

/** Flatten Discord's validation error into a few readable lines. */
function explainApiError(e) {
  const out = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object' || out.length >= 3) return;
    if (Array.isArray(node._errors)) for (const x of node._errors) out.push(`${path || 'message'}: ${x.message}`);
    for (const [k, v] of Object.entries(node)) if (k !== '_errors') walk(v, path ? `${path}.${k}` : k);
  };
  walk(e?.rawError?.errors, '');
  if (out.length) return out.join('\n');
  if (e?.code === 50013 || e?.code === 50001) return 'I\'m missing permission to send there';
  return String(e?.message || 'Discord refused the message').slice(0, 200);
}

module.exports = { parse, toPayload, explainApiError, JsonError, MAX_MESSAGES };
