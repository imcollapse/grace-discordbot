// Family — Discord-facing helpers: a tiny context wrapper (slash + prefix behave the same),
// containers, image panels, ephemeral notices and the confirm / offer plumbing.

const {
    MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder,
} = require('discord.js');
const ui = require('../ui');

const V2 = MessageFlags.IsComponentsV2;
const EPH = MessageFlags.Ephemeral;

const COLOR = { rose: 0xFFB3D9, gold: 0x9FDCFF, lav: 0xC4B5FD, ok: 0xA8F0D0, bad: 0xFF9DB5, warn: 0xFFD6A5 };
const GLYPH = { ok: '✦', bad: '✕', warn: '!', info: '❖' };
const NO_PING = { parse: [], repliedUser: false };
const EPHEMERAL_DELETE_MS = 15000;

/* ── containers ─────────────────────────────────────────────────────── */

/** Small status container. kind: ok | bad | warn | info */
function note(kind, title, body = '', footer = '') {
    const accent = { ok: COLOR.ok, bad: COLOR.bad, warn: COLOR.warn, info: COLOR.lav }[kind] ?? COLOR.lav;
    const box = ui.box('base').setAccentColor(accent);
    box.addTextDisplayComponents(ui.text(`### ${GLYPH[kind] || '❖'}  ${title}`));
    if (body) box.addTextDisplayComponents(ui.text(body));
    if (footer) box.addTextDisplayComponents(ui.text(ui.sub(footer)));
    return box;
}

const file = (buffer, name) => new AttachmentBuilder(buffer, { name });
const gallery = (name) => new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`));

/** Image panel: card, optional text, optional rows. */
function panel({ image, lines, footer, rows = [], color = COLOR.rose } = {}) {
    const box = ui.box('base').setAccentColor(color);
    if (image) box.addMediaGalleryComponents(gallery(image));
    const body = Array.isArray(lines) ? lines.filter(Boolean).join('\n') : lines;
    if (body) box.addTextDisplayComponents(ui.text(body));
    if (footer) box.addTextDisplayComponents(ui.text(ui.sub(footer)));
    for (const r of rows) box.addActionRowComponents(r);
    return box;
}

/* ── people ─────────────────────────────────────────────────────────── */

const infoCache = new Map();

/** { id, name, avatar } for a user id or User object. */
async function person(client, userOrId, guild = null, size = 256) {
    const id = typeof userOrId === 'string' ? userOrId : userOrId.id;
    let user = typeof userOrId === 'string' ? (client.users.cache.get(id) || null) : userOrId;
    if (!user) {
        const hit = infoCache.get(`${id}:${size}`);
        if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.val;
        user = await client.users.fetch(id).catch(() => null);
    }
    const member = guild?.members?.cache?.get(id);
    const val = {
        id,
        name: (member?.displayName || user?.displayName || user?.username || 'Unknown').slice(0, 32),
        avatar: user ? user.displayAvatarURL({ extension: 'png', size }) : null,
    };
    infoCache.set(`${id}:${size}`, { val, at: Date.now() });
    return val;
}

/* ── context wrapper ────────────────────────────────────────────────── */

class Ctx {
    constructor(raw, args = []) {
        this.raw = raw;
        this.slash = !!raw.isChatInputCommand?.();
        this.args = args;
        this.user = this.slash ? raw.user : raw.author;
        this.client = raw.client;
        this.guild = raw.guild || null;
        this.sent = null;
    }

    /** Users given to the command, in order (mentions / ids / replied-to author for prefix). */
    async users(names = ['user']) {
        if (this.slash) return names.map((n) => this.raw.options.getUser(n)).filter(Boolean);
        const out = [];
        for (const a of this.args) {
            const m = a.match(/^<@!?(\d{17,20})>$/) || a.match(/^(\d{17,20})$/);
            if (!m) continue;
            const u = this.client.users.cache.get(m[1]) || await this.client.users.fetch(m[1]).catch(() => null);
            if (u && !out.some((x) => x.id === u.id)) out.push(u);
        }
        if (!out.length && this.raw.reference?.messageId) {
            const ref = await this.raw.fetchReference().catch(() => null);
            if (ref) out.push(ref.author);
        }
        return out;
    }

    async defer({ ephemeral = false } = {}) {
        if (this.slash) {
            if (!this.raw.deferred && !this.raw.replied) { await this.raw.deferReply(ephemeral ? { flags: EPH } : {}).catch(() => {}); this.deferredEphemeral = ephemeral; }
        } else this.raw.channel?.sendTyping?.().catch(() => {});
    }

    /** Send / edit the first reply. Ephemeral is real on slash; on prefix it self-deletes. */
    async reply(components, { files = [], ephemeral = false } = {}) {
        const list = Array.isArray(components) ? components : [components];
        const r = this.raw;
        if (this.slash) {
            if (r.deferred && !r.replied && ephemeral && !this.deferredEphemeral) {
                // the deferral was public; swap it for a private message
                await r.deleteReply().catch(() => {});
                this.sent = await r.followUp({ components: list, files, flags: V2 | EPH, allowedMentions: NO_PING });
            } else if (r.deferred && !r.replied) this.sent = await r.editReply({ components: list, files, flags: V2, allowedMentions: NO_PING });
            else if (r.replied) this.sent = await r.followUp({ components: list, files, flags: V2 | (ephemeral ? EPH : 0), allowedMentions: NO_PING });
            else {
                const res = await r.reply({ components: list, files, flags: V2 | (ephemeral ? EPH : 0), allowedMentions: NO_PING, withResponse: true });
                this.sent = res?.resource?.message ?? await r.fetchReply();
            }
            return this.sent;
        }
        this.sent = await r.reply({ components: list, files, flags: V2, allowedMentions: NO_PING });
        if (ephemeral) setTimeout(() => this.sent?.delete?.().catch(() => {}), EPHEMERAL_DELETE_MS);
        return this.sent;
    }

    /** Quick ephemeral notice. */
    say(kind, title, body, footer) { return this.reply(note(kind, title, body, footer), { ephemeral: true }); }
}

/* ── confirm ────────────────────────────────────────────────────────── */

/**
 * Ask the author to confirm. Resolves { ok, show(components, files) } — `show` edits the confirm
 * message in place (so success / error stays ephemeral on slash).
 */
async function confirm(w, { title, body, yes = 'Confirm', kind = 'warn', danger = true }) {
    const stamp = `${Date.now().toString(36)}${w.user.id.slice(-4)}`;
    const yesId = `fam_yes_${stamp}`, noId = `fam_no_${stamp}`;
    const box = note(kind, title, body, 'Expires in 30 seconds');
    box.addActionRowComponents(ui.row(ui.btn(yesId, yes, { style: danger ? 'danger' : 'success' }), ui.btn(noId, 'Cancel')));
    const msg = await w.reply(box, { ephemeral: true });

    return new Promise((resolve) => {
        const col = msg.createMessageComponentCollector({ time: 30000, filter: ui.onlyUser(w.user.id) });
        let done = false;
        col.on('collect', async (i) => {
            if (i.customId !== yesId && i.customId !== noId) return;
            done = true; col.stop('answered');
            try { await i.deferUpdate(); } catch (_) {}
            if (i.customId === noId) {
                await i.editReply({ components: [note('info', 'Cancelled', 'Nothing was changed.')], flags: V2, attachments: [] }).catch(() => {});
                return resolve({ ok: false });
            }
            resolve({ ok: true, show: (components, files = []) => i.editReply({ components: Array.isArray(components) ? components : [components], files, flags: V2, attachments: [] }).catch(() => {}) });
        });
        col.on('end', async () => {
            if (done) return;
            await msg.edit({ components: [note('info', 'Timed out', 'No changes were made.')], flags: V2 }).catch(() => {});
            resolve({ ok: false });
        });
    });
}

module.exports = { Ctx, COLOR, V2, EPH, NO_PING, note, panel, file, gallery, person, confirm, ui };
