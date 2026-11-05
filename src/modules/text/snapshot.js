// grace — snapshot: back up a server's structure and load it anywhere.
//   snapshot create [name]     snapshot list     snapshot info <id>     snapshot delete <id>
//   snapshot load <id>         snapshot access <owner|admins>

const { MessageFlags } = require('discord.js');
const ui = require('../../services/ui');
const emojis = require('../../media/emojis.json');
const S = require('../../services/snapshot');
const { restore, check } = require('../../services/snapshot/restore');

const V2 = MessageFlags.IsComponentsV2;
const TICK = emojis.success, CROSS = emojis.error;
const ts = (d, s = 'R') => `<t:${Math.floor(new Date(d).getTime() / 1000)}:${s}>`;
const loading = new Set();

const line = (icon, text) => ui.box('base').setAccentColor(icon === TICK ? ui.COLOR.success : ui.COLOR.error).addTextDisplayComponents(ui.text(`${icon}  ${text}`));
const send = (message, c) => message.reply({ components: [c], flags: V2, allowedMentions: { parse: [] } });
const countLine = (c) => `${c.roles} roles · ${c.categories} categories · ${c.channels} channels · ${c.emojis} emojis`;

function entry(snap) {
    return [`**${snap.name}**  ·  \`${snap.id}\``, `${snap.sourceName || 'Unknown server'}  ·  ${ts(snap.createdAt)}`, countLine(snap.counts)].join('\n');
}

module.exports = {
    name: 'snapshot',
    description: 'Back up a server\'s structure and load it back any time',
    aliases: ['backup'],
    usage: 'snapshot create [name] | list | info <id> | delete <id> | load <id> | access <owner|admins>',
    category: 'utility',

    async execute(message, args = []) {
        const { guild } = message;
        if (!guild) return;
        const sub = (args[0] || 'list').toLowerCase();
        const rest = args.slice(1);

        if (sub === 'access') return access(message, rest[0]);
        if (!(await S.mayUse(guild, message.member))) {
            const admins = await S.adminsAllowed(guild.id);
            return send(message, line(CROSS, admins ? 'Only the server owner and admins can use snapshots.' : 'Only the server owner can use snapshots.'));
        }

        switch (sub) {
            case 'create': case 'save': case 'make': return create(message, rest.join(' ').trim());
            case 'list': case 'ls': return list(message);
            case 'info': return info(message, rest[0]);
            case 'delete': case 'remove': case 'del': return del(message, rest[0]);
            case 'load': case 'restore': return load(message, rest[0]);
            default: return send(message, line(CROSS, 'Use `snapshot create`, `list`, `info`, `delete`, `load` or `access`.'));
        }
    },
};

async function create(message, name) {
    const wait = await message.reply({ components: [line(TICK, 'Creating snapshot…')], flags: V2, allowedMentions: { parse: [] } });
    const edit = (c) => wait.edit({ components: [c], flags: V2 }).catch(() => message.channel.send({ components: [c], flags: V2 }));
    let res;
    try { res = await S.create(message.guild, message.author, name); }
    catch (err) { console.error('[snapshot] create failed:', err); return edit(line(CROSS, 'Could not create the snapshot.')); }

    if (!res.ok) return edit(line(CROSS, res.reason === 'full' ? `All ${res.limit} snapshot slots are used. Delete one first.` : 'This server is too large to snapshot.'));
    const snap = res.snap;
    require('../../services/premium/views').nudge(message, { plan: 'user', topic: 'snapshot', line: `**Free accounts get ${res.limit} snapshot slots.**\n> User Premium raises it to **${S.LIMITS.premium}**.` });
    return edit(ui.box('base').setAccentColor(ui.COLOR.success)
        .addTextDisplayComponents(ui.text(`### ${TICK}  Snapshot created`))
        .addSeparatorComponents(ui.sep(true))
        .addTextDisplayComponents(ui.text([`**ID**  \`${snap.id}\``, `**Name**  ${snap.name}`, `**Contents**  ${countLine(snap.counts)}`, `**Slots**  ${res.used}/${res.limit}`].join('\n'))));
}

async function list(message) {
    const [rows, limit] = await Promise.all([S.listFor(message.author.id), S.limitFor(message.author.id)]);
    if (!rows.length) return send(message, line(CROSS, `No snapshots yet (0/${limit} slots).`));
    const b = ui.box('base').setAccentColor(ui.COLOR.base)
        .addTextDisplayComponents(ui.text(`### Snapshots  ·  ${rows.length}/${limit}`))
        .addSeparatorComponents(ui.sep(true, true));
    rows.forEach((r, i) => { b.addTextDisplayComponents(ui.text(entry(r))); if (i < rows.length - 1) b.addSeparatorComponents(ui.sep(false)); });
    return send(message, b);
}

/** The snapshot, if it exists and belongs to the user. */
async function mine(message, id) {
    if (!id) { await send(message, line(CROSS, 'Give the snapshot ID.')); return null; }
    const snap = await S.get(id);
    if (!snap || snap.ownerId !== message.author.id) { await send(message, line(CROSS, 'Snapshot not found.')); return null; }
    return snap;
}

async function info(message, id) {
    const snap = await mine(message, id);
    if (!snap) return undefined;
    return send(message, ui.box('base').setAccentColor(ui.COLOR.base).addTextDisplayComponents(ui.text(entry(snap))));
}

async function del(message, id) {
    const snap = await mine(message, id);
    if (!snap) return undefined;
    await S.remove(message.author.id, snap.id);
    return send(message, line(TICK, `Deleted **${snap.name}**.`));
}

async function access(message, value) {
    const { guild } = message;
    const current = await S.adminsAllowed(guild.id);
    if (message.author.id !== guild.ownerId) return send(message, line(CROSS, 'Only the server owner can change this.'));
    const v = (value || '').toLowerCase();
    if (!v) return send(message, line(TICK, current ? 'Owner and admins can use snapshots.' : 'Only the owner can use snapshots.'));
    if (['admins', 'admin', 'on', 'allow'].includes(v)) { await S.setAdminsAllowed(guild.id, true); return send(message, line(TICK, 'Admins can now use snapshots.')); }
    if (['owner', 'off', 'deny'].includes(v)) { await S.setAdminsAllowed(guild.id, false); return send(message, line(TICK, 'Only the owner can use snapshots.')); }
    return send(message, line(CROSS, 'Use `snapshot access owner` or `snapshot access admins`.'));
}

async function load(message, id) {
    const { guild } = message;
    const snap = await mine(message, id);
    if (!snap) return undefined;
    const problem = check(guild);
    if (problem) return send(message, line(CROSS, problem));
    if (loading.has(guild.id)) return send(message, line(CROSS, 'A snapshot is already loading here.'));

    const stamp = `${Date.now().toString(36)}`;
    const yes = `snap_yes_${stamp}`, no = `snap_no_${stamp}`;
    const ask = ui.box('base').setAccentColor(ui.COLOR.warning)
        .addTextDisplayComponents(ui.text(`### Load **${snap.name}**?\nEvery channel, role and emoji in this server is deleted and replaced.\n${countLine(snap.counts)}`))
        .addActionRowComponents(ui.row(ui.btn(yes, 'Load', { style: 'danger' }), ui.btn(no, 'Cancel')));
    const sent = await message.reply({ components: [ask], flags: V2, allowedMentions: { parse: [] } });

    const col = sent.createMessageComponentCollector({ filter: ui.onlyUser(message.author.id), time: 30000, max: 1 });
    col.on('collect', async (i) => {
        await i.deferUpdate().catch(() => {});
        if (i.customId !== yes) return i.editReply({ components: [line(CROSS, 'Cancelled.')], flags: V2 }).catch(() => {});

        loading.add(guild.id);
        const started = Date.now();
        const progress = (stage) => sent.edit({ components: [line(TICK, `${stage}…`)], flags: V2 }).catch(() => {});
        let out, failed = null;
        try {
            await progress('Loading snapshot');
            out = await restore(guild, S.unpack(snap.data), { keepChannelId: message.channel.id, progress });
        } catch (err) { console.error('[snapshot] load failed:', err); failed = err; }
        finally { loading.delete(guild.id); }

        const secs = Math.round((Date.now() - started) / 1000);
        const done = failed
            ? line(CROSS, 'The snapshot could not be fully loaded.')
            : ui.box('base').setAccentColor(ui.COLOR.success)
                .addTextDisplayComponents(ui.text(`### ${TICK}  Snapshot loaded`))
                .addSeparatorComponents(ui.sep(true))
                .addTextDisplayComponents(ui.text([`**Name**  ${snap.name}`, `**Created**  ${out.created.roles} roles · ${out.created.channels} channels · ${out.created.emojis} emojis`, out.skipped ? `**Skipped**  ${out.skipped}` : null, `**Time**  ${secs}s`].filter(Boolean).join('\n')));

        // the original channel is gone: report in the first channel of the new layout, and by DM
        const target = out?.firstText;
        if (target) await target.send({ components: [done], flags: V2, allowedMentions: { parse: [] } }).catch(() => {});
        await message.author.send({ components: [done], flags: V2 }).catch(() => {});
        if (!out) await sent.edit({ components: [done], flags: V2 }).catch(() => {});
    });
    col.on('end', (_c, reason) => { if (reason === 'time') sent.edit({ components: [line(CROSS, 'Timed out.')], flags: V2 }).catch(() => {}); });
    return undefined;
}
