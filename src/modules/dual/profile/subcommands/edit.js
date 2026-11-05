// grace · profile edit. The profile editor: Edit Profile (a form), Banner (upload a picture straight from your
// device in a form), a theme menu and Reset. The preview redraws after every change. Saved as you go.

const {
    ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, LabelBuilder, FileUploadBuilder,
    MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags,
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const ui = require('../../../../services/ui');
const cards = require('../../../../database/profileCards');
const view = require('../../../../services/profileView');
const { renderProfile, THEMES, themeKey, clean, parseHex } = require('../../../../services/profileCard2');

const MAX_UPLOAD = 8 * 1024 * 1024;

const input = (id, label, { value, placeholder, max = 100, paragraph = false, required = false } = {}) => {
    const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(required).setMaxLength(max);
    if (placeholder) t.setPlaceholder(placeholder);
    if (value) t.setValue(String(value).slice(0, max));
    return new ActionRowBuilder().addComponents(t);
};

/** The picture a member attached in the banner form, or null. */
function uploadedFile(submit, id) {
    try {
        const files = submit.fields.getUploadedFiles(id, false);
        const first = files?.first?.() ?? [...(files?.values?.() ?? [])][0];
        if (first) return first;
    } catch { /* older discord.js: fall through */ }
    try {
        const raw = submit.fields.fields?.get(id)?.values ?? [];
        const res = submit.data?.resolved?.attachments ?? submit.resolved?.attachments;
        const att = res?.get?.(raw[0]) ?? res?.[raw[0]];
        if (att) return att;
    } catch { /* nothing */ }
    return null;
}

/** Downloads, checks and shrinks a banner. Returns a JPEG buffer, or { error }. */
async function prepareBanner(att) {
    if (!att) return { error: 'I didn\'t get a picture. Attach an image in the form.' };
    if (att.contentType && !/^image\//.test(att.contentType)) return { error: 'That file isn\'t an image. Use a PNG, JPG, WebP or GIF.' };
    if (att.size > MAX_UPLOAD) return { error: 'That picture is bigger than 8 MB. Use a smaller one.' };
    try {
        const res = await fetch(att.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const img = await loadImage(Buffer.from(await res.arrayBuffer()));
        const W = 1350, H = 405;                              // 10 : 3, a little larger than it is drawn
        const c = createCanvas(W, H), g = c.getContext('2d');
        const s = Math.max(W / img.width, H / img.height);
        g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
        return { buffer: c.toBuffer('image/jpeg', 88) };
    } catch (e) {
        console.error('[profile banner]', e.message);
        return { error: 'I couldn\'t read that picture. Try another one.' };
    }
}

module.exports = {
    prepareBanner,
    async execute(ctx) {
        const slash = !!ctx.isChatInputCommand?.();
        const user = ctx.user ?? ctx.author;
        const id = user.id;

        if (slash && !ctx.deferred && !ctx.replied) await ctx.deferReply();
        let status = 'offline';
        try { status = (await ctx.guild?.members.fetch(id))?.presence?.status || 'offline'; } catch { /* dm or no intent */ }

        let data, saved, n = 0, busy = false;
        const send = (body) => (slash ? ctx.editReply(body) : ctx.reply(body));
        try {
            data = await view.gather(ctx.client, ctx.guild, user, status);
            saved = { ...data.saved };
        } catch (e) {
            console.error('[profile edit]', e);
            return send({ content: 'I couldn\'t open the profile editor right now. Try again in a moment.' });
        }

        const body = async ({ final = false } = {}) => {
            const name = `profile-edit-${++n}.png`;
            const card = view.compose(saved, data.fallback);
            const file = new AttachmentBuilder(await renderProfile({ ...data, card }), { name });
            const c = ui.box('base').addTextDisplayComponents(ui.text(
                final ? '### Profile Editor\n-# Closed. Open it again any time with `profileedit`.'
                    : '### Profile Editor\n> Update your profile using the buttons below.\n-# Tagline and description are required.',
            )).addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`)));
            if (!final) {
                const th = themeKey(card.theme);
                const custom = parseHex(card.color);
                c.addActionRowComponents(ui.row(ui.select('pe_theme', custom ? `Custom colour ${custom}` : 'Theme',
                    Object.entries(THEMES).map(([value, t]) => ({ label: t.name, value, default: !custom && value === th })))));
                c.addActionRowComponents(ui.row(
                    ui.btn('pe_edit', 'Edit Profile'), ui.btn('pe_color', 'Colour'), ui.btn('pe_banner', 'Banner'),
                    ...(data.banner ? [ui.btn('pe_nobanner', 'Remove Banner')] : []),
                    ui.btn('pe_reset', 'Reset Profile', { style: 'danger' }),
                ));
            }
            return { components: [c], files: [file], attachments: [], flags: MessageFlags.IsComponentsV2 };
        };

        let msg;
        try { msg = await send(await body()); }
        catch (e) { console.error('[profile edit]', e); return send({ content: 'I couldn\'t draw your card right now. Try again in a moment.' }).catch(() => {}); }
        if (typeof msg?.createMessageComponentCollector !== 'function') return msg;

        const persist = (patch) => cards.set(id, patch).then((v) => { saved = v; });
        const note = (i, text) => i.followUp({ content: text, flags: MessageFlags.Ephemeral }).catch(() => {});

        const modals = {
            pe_edit: () => new ModalBuilder().setCustomId('pe_edit_m').setTitle('Edit Profile').addComponents(
                input('tagline', 'Tagline', { value: saved.tagline, max: 80, required: true, placeholder: 'One line about you' }),
                input('bio', 'About you', { value: saved.bio ?? data.fallback.bio, max: 150, paragraph: true, required: true, placeholder: 'A few words about what you like' }),
                input('location', 'Location', { value: saved.location, max: 40, placeholder: 'Optional' }),
                input('age', 'Age', { value: saved.age, max: 3, placeholder: 'Optional, numbers only' }),
                input('profession', 'Profession', { value: saved.profession, max: 50, placeholder: 'Optional' }),
            ),
            pe_color: () => new ModalBuilder().setCustomId('pe_color_m').setTitle('Card Colour').addComponents(
                input('color', 'Hex colour', { value: parseHex(saved.color) ?? '', max: 7, placeholder: '#5865f2 (leave empty to use a theme)' }),
            ),
            pe_banner: () => new ModalBuilder().setCustomId('pe_banner_m').setTitle('Profile Banner').addLabelComponents(
                new LabelBuilder().setLabel('Banner picture')
                    .setDescription('Upload an image from your device. Wide pictures look best (PNG, JPG, WebP, GIF up to 8 MB).')
                    .setFileUploadComponent(new FileUploadBuilder().setCustomId('file').setMinValues(1).setMaxValues(1).setRequired(true)),
            ),
        };

        const apply = {
            pe_edit_m: async (f, i) => {
                const age = f.fields.getTextInputValue('age').trim();
                if (age && !/^\d{1,3}$/.test(age)) await note(i, 'Age has to be a number, so I left it out.');
                await persist({
                    tagline: clean(f.fields.getTextInputValue('tagline'), 80), bio: clean(f.fields.getTextInputValue('bio'), 150),
                    location: clean(f.fields.getTextInputValue('location'), 40), age: /^\d{1,3}$/.test(age) ? age : null,
                    profession: clean(f.fields.getTextInputValue('profession'), 50),
                });
            },
            pe_color_m: async (f, i) => {
                const raw = f.fields.getTextInputValue('color').trim();
                if (!raw) return persist({ color: null });
                const hex = parseHex(raw);
                if (!hex) return note(i, 'That is not a hex colour. Use something like #5865f2.');
                await persist({ color: hex });
            },
            pe_banner_m: async (f, i) => {
                const out = await prepareBanner(uploadedFile(f, 'file'));
                if (out.error) return note(i, out.error);
                await cards.setBanner(id, out.buffer);
                data.banner = out.buffer;
            },
        };

        const col = msg.createMessageComponentCollector({ time: 15 * 60_000, filter: ui.onlyUser(id) });
        col.on('collect', async (i) => {
            if (busy) return i.deferUpdate().catch(() => {});
            busy = true;
            try {
                if (modals[i.customId]) {
                    await i.showModal(modals[i.customId]());
                    const f = await i.awaitModalSubmit({ time: 5 * 60_000, filter: (m) => m.user.id === id && m.customId === `${i.customId}_m` }).catch(() => null);
                    if (!f) return;
                    await f.deferUpdate();
                    await apply[`${i.customId}_m`](f, f);
                    await f.editReply(await body());
                    return;
                }
                await i.deferUpdate();
                if (i.customId === 'pe_theme') await persist({ theme: i.values[0], color: null });
                else if (i.customId === 'pe_nobanner') { await cards.setBanner(id, null); data.banner = null; }
                else if (i.customId === 'pe_reset') {
                    await cards.clear(id);
                    await require('../../../../database/schemas').Profile.resetProfile(id).catch(() => {});
                    saved = {}; data.banner = null; data.fallback = { bio: '' };
                }
                await i.editReply(await body());
            } catch (e) {
                console.error('[profile edit]', e);
                note(i, 'Something went wrong while saving that. Try again.');
            } finally { busy = false; }
        });
        col.on('end', async () => { try { await msg.edit(await body({ final: true })); } catch { /* message gone */ } });
        return msg;
    },
};
