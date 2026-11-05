// grace · buttons, menus and modals of the level setup panel and the level-up embed editor (`lvl:<action>`).

const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const kit = require('../../services/ui');
const L = require('../../services/levels');
const P = require('../../services/levelPanel');
const db = require('../../database/levels');
const { isUrlOrVar, parseColor, colorToHex, MAX_FIELDS } = require('../../services/embedRender');

const V2 = MessageFlags.IsComponentsV2;
const EPH = MessageFlags.Ephemeral;
const NO_PING = { parse: [] };

const say = (i, c) => i.reply({ components: [c], flags: V2 | EPH, allowedMentions: NO_PING });
const input = (id, label, { style = TextInputStyle.Short, value, max = 100, required = false, placeholder } = {}) => {
    const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
    if (value) t.setValue(String(value).slice(0, max));
    if (placeholder) t.setPlaceholder(placeholder.slice(0, 100));
    return new ActionRowBuilder().addComponents(t);
};
const modal = (id, title, ...rows) => new ModalBuilder().setCustomId(id).setTitle(title).addComponents(...rows);
const val = (i, id) => (i.fields.getTextInputValue(id) ?? '').trim();

const save = async (guildId, patch) => { const r = await db.setGuild(guildId, patch); L.bust(guildId); return r; };

async function redraw(i, note = '') {
    const [cfg, rewards] = await Promise.all([db.guild(i.guildId), db.roles(i.guildId)]);
    const components = await P.panel(i.guild, cfg, rewards, { note });
    return i.update({ components, flags: V2, allowedMentions: NO_PING });
}

/** Re-draw the editor in place (button or modal on the editor message). */
async function reEditor(i, note = '') {
    const [cfg, rewards] = await Promise.all([db.guild(i.guildId), db.roles(i.guildId)]);
    const { flags, ...body } = await P.editor(i.member, i.channel, cfg, rewards, note);
    return i.update(body);
}

/** Change the embed design and keep it. */
async function patchEmbed(guildId, fn) {
    const cfg = await db.guild(guildId);
    const d = { ...L.DEFAULT_EMBED, ...(cfg.embed ?? {}) };
    d.fields = [...(d.fields ?? [])];
    fn(d);
    return save(guildId, { embed: d });
}

/** Try to refresh the panel the editor was opened from. */
const refreshPanel = async (i) => {
    try {
        const [cfg, rewards] = await Promise.all([db.guild(i.guildId), db.roles(i.guildId)]);
        await i.message?.edit({ components: await P.panel(i.guild, cfg, rewards), flags: V2, allowedMentions: NO_PING });
    } catch { /* the panel may be gone */ }
};

const hex = (n) => (n == null ? '' : colorToHex(n));

async function handle(i) {
    const id = i.customId;
    if (!id?.startsWith('lvl:')) return false;
    if (!i.inGuild()) return true;
    if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild) && !i.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await say(i, kit.fail('You need the **Manage Server** permission.'));
        return true;
    }
    const [, action, arg] = id.split(':');
    const gid = i.guildId;

    /* ---------- modals ---------- */
    if (i.isModalSubmit()) {
        switch (action) {
            case 'm_set': {
                const n = (k) => Number(val(i, k));
                const min = n('min'), max = n('max'), cd = n('cd'), del = n('del');
                if (![min, max, cd, del].every(Number.isFinite)) { await say(i, kit.fail('Use whole numbers in every box.')); return true; }
                if (min < 1 || max < min || max > 500) { await say(i, kit.fail('XP must be at least 1, and the top value can\'t be below the bottom (max 500).')); return true; }
                if (cd < 0 || cd > 3600) { await say(i, kit.fail('The cooldown is 0 to 3600 seconds.')); return true; }
                if (del < 0 || del > 3600) { await say(i, kit.fail('Auto-delete is 0 (off) to 3600 seconds.')); return true; }
                await save(gid, { xp_min: Math.round(min), xp_max: Math.round(max), cooldown: Math.round(cd), auto_delete: Math.round(del) });
                await redraw(i, `${kit.emojis.success} Saved.`);
                return true;
            }
            case 'm_msg': {
                const text = val(i, 'text');
                const fromEditor = arg === 'e';
                await save(gid, { message: text || null, ...(fromEditor || !text ? {} : { style: 'text' }) });
                if (fromEditor) await reEditor(i, text ? `${kit.emojis.success} Message saved.` : 'Message removed.');
                else await redraw(i, `${kit.emojis.success} Message saved.`);
                return true;
            }
            case 'm_text': {
                const color = val(i, 'color');
                const c = color ? parseColor(color) : undefined;
                if (color && c === undefined) { await say(i, kit.fail('That colour isn\'t valid. Use hex like `#f0b04a`.')); return true; }
                for (const k of ['thumb', 'image']) if (val(i, k) && !isUrlOrVar(val(i, k))) { await say(i, kit.fail(`The ${k === 'thumb' ? 'thumbnail' : 'image'} must be a link or a single variable like \`{user.avatar}\`.`)); return true; }
                await patchEmbed(gid, (d) => {
                    // null (not undefined) so a cleared box stays cleared instead of falling back to the built-in design
                    d.title = val(i, 'title') || null; d.description = val(i, 'desc') || null;
                    d.color = c ?? null; d.thumbnail = val(i, 'thumb') || null; d.image = val(i, 'image') || null;
                });
                await reEditor(i, `${kit.emojis.success} Saved.`);
                return true;
            }
            case 'm_meta': {
                for (const k of ['aicon', 'ficon']) if (val(i, k) && !isUrlOrVar(val(i, k))) { await say(i, kit.fail('Icons must be a link or a single variable like `{user.avatar}`.')); return true; }
                await patchEmbed(gid, (d) => {
                    d.author = val(i, 'aname') ? { name: val(i, 'aname'), icon: val(i, 'aicon') || null } : null;
                    d.footer = val(i, 'ftext') ? { text: val(i, 'ftext'), icon: val(i, 'ficon') || null } : null;
                });
                await reEditor(i, `${kit.emojis.success} Saved.`);
                return true;
            }
            case 'm_field': {
                const name = val(i, 'name'), value = val(i, 'value');
                const inline = /^(y|yes|true|1|on)/i.test(val(i, 'inline'));
                const cfg = await db.guild(gid);
                if ((cfg.embed?.fields?.length ?? 0) >= MAX_FIELDS) { await say(i, kit.fail(`An embed holds ${MAX_FIELDS} fields at most.`)); return true; }
                await patchEmbed(gid, (d) => { d.fields.push({ name, value, inline }); });
                await reEditor(i, `${kit.emojis.success} Field added.`);
                return true;
            }
        }
        return true;
    }

    const value = i.values?.[0];

    switch (action) {
        /* ---------- main panel ---------- */
        case 'toggle': {
            const cfg = await db.guild(gid);
            await save(gid, { enabled: !cfg.enabled });
            await redraw(i, !cfg.enabled ? `${kit.emojis.success} Levels are on. Members earn XP from now.` : 'Levels are off. Nothing is lost, XP is kept.');
            return true;
        }
        case 'channel': {
            const ch = i.channels?.first();
            await save(gid, { channel_id: ch?.id ?? null, ...(ch ? { mode: 'channel' } : {}) });
            await redraw(i);
            return true;
        }
        case 'mode': {
            const cfg = await db.guild(gid);
            if (value === 'channel' && !cfg.channel_id) { await say(i, kit.warn('Pick a channel first.')); return true; }
            await save(gid, { mode: value });
            await redraw(i);
            return true;
        }
        case 'style': {
            if (arg === 'embed') {
                const cfg = await save(gid, { style: 'embed' });
                const rewards = await db.roles(gid);
                await i.reply(await P.editor(i.member, i.channel, cfg, rewards));
                await refreshPanel(i);
                return true;
            }
            if (arg === 'text') {
                const cfg = await db.guild(gid);
                await i.showModal(modal('lvl:m_msg', 'Level-up message', input('text', 'Message (variables work)', {
                    style: TextInputStyle.Paragraph, required: true, max: 2000, value: cfg.message, placeholder: '{user} just reached level {level}!',
                })));
                return true;
            }
            await save(gid, { style: arg });
            await redraw(i, arg === 'container' ? 'Pick a saved container below. Make one with `/container create`.' : '');
            return true;
        }
        case 'ctr':
            await save(gid, { style: 'container', container: value });
            await redraw(i, `${kit.emojis.success} Using container \`${value}\`.`);
            return true;
        case 'voice': { const c = await db.guild(gid); await save(gid, { voice: !c.voice }); await redraw(i); return true; }
        case 'stack': { const c = await db.guild(gid); await save(gid, { stack: !c.stack }); await redraw(i); return true; }
        case 'settings': {
            const c = await db.guild(gid);
            await i.showModal(modal('lvl:m_set', 'XP and timing',
                input('min', 'Lowest XP per message', { value: c.xp_min, max: 3, required: true }),
                input('max', 'Highest XP per message', { value: c.xp_max, max: 3, required: true }),
                input('cd', 'Cooldown between earning (seconds)', { value: c.cooldown, max: 4, required: true }),
                input('del', 'Delete announcements after (seconds, 0 = keep)', { value: c.auto_delete, max: 4, required: true })));
            return true;
        }
        case 'prev': {
            const [cfg, rewards] = await Promise.all([db.guild(gid), db.roles(gid)]);
            const out = await L.build(i.guild, cfg, await P.sample(i.member, i.channel, rewards));
            if (!out.payload) { await say(i, kit.warn(out.problem ?? 'Nothing to show.')); return true; }
            await i.reply({ ...out.payload, flags: (out.payload.flags ?? 0) | EPH, allowedMentions: NO_PING });
            if (out.problem) await i.followUp({ components: [kit.warn(out.problem)], flags: V2 | EPH });
            return true;
        }
        case 'vars':
            await i.reply({ components: P.variablesCard(), flags: V2 | EPH, allowedMentions: NO_PING });
            return true;

        /* ---------- embed editor ---------- */
        case 'e_text': {
            const d = { ...L.DEFAULT_EMBED, ...((await db.guild(gid)).embed ?? {}) };
            await i.showModal(modal('lvl:m_text', 'Edit embed',
                input('title', 'Title', { value: d.title, max: 256, placeholder: 'Level up!' }),
                input('desc', 'Description', { value: d.description, style: TextInputStyle.Paragraph, max: 4000, placeholder: '{user} reached level {level}' }),
                input('color', 'Colour (hex)', { value: hex(d.color), max: 7, placeholder: '#f0b04a' }),
                input('thumb', 'Thumbnail (link or {user.avatar})', { value: d.thumbnail, max: 300 }),
                input('image', 'Large image (link or variable)', { value: d.image, max: 300 })));
            return true;
        }
        case 'e_meta': {
            const d = { ...L.DEFAULT_EMBED, ...((await db.guild(gid)).embed ?? {}) };
            await i.showModal(modal('lvl:m_meta', 'Author and footer',
                input('aname', 'Author name', { value: d.author?.name, max: 256, placeholder: '{user.nick}' }),
                input('aicon', 'Author icon (link or {user.avatar})', { value: d.author?.icon, max: 300 }),
                input('ftext', 'Footer text', { value: d.footer?.text, max: 2048, placeholder: 'Rank #{rank}' }),
                input('ficon', 'Footer icon (link or variable)', { value: d.footer?.icon, max: 300 })));
            return true;
        }
        case 'e_field':
            await i.showModal(modal('lvl:m_field', 'Add a field',
                input('name', 'Field name', { required: true, max: 256, placeholder: 'Total XP' }),
                input('value', 'Field value', { required: true, style: TextInputStyle.Paragraph, max: 1024, placeholder: '{xp.total}' }),
                input('inline', 'Side by side? (yes / no)', { value: 'yes', max: 3 })));
            return true;
        case 'e_msg': {
            const c = await db.guild(gid);
            await i.showModal(modal('lvl:m_msg:e', 'Message above the embed', input('text', 'Text (leave empty for none)', {
                style: TextInputStyle.Paragraph, value: c.message, max: 2000, placeholder: 'Congrats {user}!' })));
            return true;
        }
        case 'e_rmfield':
            await patchEmbed(gid, (d) => { d.fields.splice(Number(value), 1); });
            await reEditor(i, 'Field removed.');
            return true;
        case 'e_ts':
            await patchEmbed(gid, (d) => { d.timestamp = !d.timestamp; });
            await reEditor(i);
            return true;
        case 'e_reset':
            await save(gid, { embed: null });
            await reEditor(i, 'Back to the built-in design.');
            return true;
        case 'e_vars':
            await i.reply({ components: P.variablesCard(), flags: V2 | EPH, allowedMentions: NO_PING });
            return true;
        case 'e_test': {
            const [cfg, rewards] = await Promise.all([db.guild(gid), db.roles(gid)]);
            const out = await L.build(i.guild, { ...cfg, style: 'embed' }, await P.sample(i.member, i.channel, rewards));
            await i.reply({ ...out.payload, flags: EPH, allowedMentions: NO_PING });
            return true;
        }
        case 'e_done':
            await i.update({ content: 'Saved. Level-ups now use your embed.\n-# Change it any time from `level setup`.', embeds: [], components: [] });
            return true;
    }
    return false;
}

module.exports = { handle };
