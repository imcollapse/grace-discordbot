// grace — jail
//   jail setup                     create / manage the jailed role and jail channel
//   jail @user [time] [reason]     jail someone (e.g. jail @user 1h spamming)
//   jail release @user             let someone out   (same as: unjail @user)

const { PermissionFlagsBits: P, MessageFlags } = require('discord.js');
const ms = require('ms');
const ui = require('../../services/ui');
const J = require('../../services/jail');
const { blockProtectedTarget } = require('../../services/modGuard');

const V2 = MessageFlags.IsComponentsV2;
const send = (message, c) => message.reply({ components: [c], flags: V2, allowedMentions: { parse: [] } });

const isAdmin = (m) => m.permissions.has(P.Administrator) || m.permissions.has(P.ManageGuild);
const canMod = (m) => m.permissions.has(P.Administrator) || m.permissions.has(P.ModerateMembers) || m.permissions.has(P.ManageRoles);

async function findMember(message, token) {
    const direct = message.mentions.members?.first();
    if (direct) return direct;
    const id = (token || '').replace(/\D/g, '');
    return id.length >= 17 ? message.guild.members.fetch(id).catch(() => null) : null;
}

const humanLength = (n) => ms(n, { long: true });

module.exports = {
    name: 'jail',
    description: 'Jail members: they lose their roles and only see the jail channel',
    aliases: [],
    usage: 'jail setup | jail <user> [time] [reason] | jail release <user>',
    category: 'moderation',

    async execute(message, args = []) {
        if (!message.guild) return;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'setup') return setupFlow(message);
        if (sub === 'release' || sub === 'free' || sub === 'unjail') return release(message, args.slice(1));
        if (!args.length) {
            return send(message, ui.box('base')
                .addTextDisplayComponents(ui.text(`### Jail\nSend someone to the jail channel. They lose their roles until released, and get them back after.`))
                .addSeparatorComponents(ui.sep(false))
                .addTextDisplayComponents(ui.text([
                    '`jail setup`  set up the jailed role and channel',
                    '`jail @user [time] [reason]`  jail someone, e.g. `jail @user 1h spamming`',
                    '`jail release @user`  or  `unjail @user`  let them out',
                    '`jailed`  see who is in jail',
                ].join('\n'))));
        }
        return jailMember(message, args);
    },
    release,
};

/* ── jail @user ────────────────────────────────────────────────────── */

async function jailMember(message, args) {
    const { guild, member: invoker } = message;
    if (!canMod(invoker)) return send(message, J.fail('You need the **Moderate Members** or **Manage Roles** permission.'));
    if (!guild.members.me.permissions.has(P.ManageRoles)) return send(message, J.fail('I need the **Manage Roles** permission.'));

    const target = await findMember(message, args[0]);
    if (!target) return send(message, J.fail('Mention the member to jail.', 'Example: `jail @user 1h spamming`'));
    if (target.id === invoker.id) return send(message, J.fail('You can\'t jail yourself.'));
    if (target.user.bot && target.id === guild.members.me.id) return blockProtectedTarget(message, message.author, target.id, 'jail');
    if (await blockProtectedTarget(message, message.author, target.id, 'jail')) return;
    if (guild.ownerId !== invoker.id && target.roles.highest.position >= invoker.roles.highest.position) return send(message, J.fail('They have an equal or higher role than you.'));
    if (!target.manageable) return send(message, J.fail('I can\'t change that member\'s roles.', 'Their top role is above mine.'));

    let length = null, rest = args.slice(1);
    if (rest[0] && /^\d/.test(rest[0])) {
        const n = ms(rest[0]);
        if (!n || n < 10000) return send(message, J.fail('That time isn\'t valid.', 'Use something like `30m`, `2h` or `1d` (at least 10s).'));
        length = n; rest = rest.slice(1);
    }
    const reason = rest.join(' ').slice(0, 400) || null;

    const res = await J.jail(guild, target, { moderatorId: invoker.id, reason, ms: length });
    if (!res.ok) {
        const text = {
            not_setup: ['Jail isn\'t set up yet.', 'Run `jail setup` first.'],
            no_role: ['The jailed role was deleted.', 'Run `jail setup` again.'],
            already: [`<@${target.id}> is already jailed.`],
            failed: ['I couldn\'t jail them.', 'Check that my role is above theirs.'],
        }[res.reason];
        return send(message, J.fail(...text));
    }
    return send(message, J.resultCard({ title: 'Member jailed', user: target.user, moderator: message.author, reason, jailedAt: res.row.jailedAt, expiresAt: res.row.expiresAt }));
}

/* ── release ───────────────────────────────────────────────────────── */

async function release(message, args) {
    const { guild, member: invoker } = message;
    if (!canMod(invoker)) return send(message, J.fail('You need the **Moderate Members** or **Manage Roles** permission.'));
    const id = (message.mentions.users?.first()?.id) || (args[0] || '').replace(/\D/g, '');
    if (!id || id.length < 17) return send(message, J.fail('Mention the member to release.', 'Example: `unjail @user`'));
    const res = await J.release(guild, id, { by: message.author.id });
    if (!res.ok) return send(message, J.fail(`<@${id}> isn't jailed.`));
    const user = message.client.users.cache.get(id) || await message.client.users.fetch(id).catch(() => ({ id, username: id }));
    return send(message, J.resultCard({ title: 'Member released', user, moderator: message.author, reason: null, extra: `**Roles**  restored${res.member ? '' : ' (they have left the server)'}` }));
}

/* ── jail setup ────────────────────────────────────────────────────── */

async function panel(guild, { confirmReset = false, busy = false, note = null } = {}) {
    const cfg = await J.config(guild.id);
    const b = ui.box('base').setAccentColor(cfg ? J.COLOR.ok : J.COLOR.base);

    if (!cfg) {
        b.addTextDisplayComponents(ui.text('### Jail setup\n-# One click and it is ready'));
        b.addSeparatorComponents(ui.sep(true, true));
        b.addTextDisplayComponents(ui.text([
            'This creates:',
            '**Jailed role**  can\'t see or use any channel except the jail channel',
            '**Jail channel**  where jailed members end up, hidden from everyone else',
            '',
            'Members you jail lose their roles and get them back when released.',
        ].join('\n')));
        if (note) b.addTextDisplayComponents(ui.text(note));
        b.addActionRowComponents(ui.row(ui.btn('jail_setup_go', 'Set it up', { style: 'success', disabled: busy }), ui.btn('jail_setup_cancel', 'Cancel', { disabled: busy })));
        return b;
    }

    const count = (await J.listJailed(guild.id)).length;
    const roleOk = guild.roles.cache.has(cfg.roleId), chOk = guild.channels.cache.has(cfg.channelId);
    b.addTextDisplayComponents(ui.text('### Jail\n-# Set up and running'));
    b.addSeparatorComponents(ui.sep(true, true));
    b.addTextDisplayComponents(ui.text([
        `**Role**  ${roleOk ? `<@&${cfg.roleId}>` : `${J.CROSS} deleted`}`,
        `**Channel**  ${chOk ? `<#${cfg.channelId}>` : `${J.CROSS} deleted`}`,
        `**Jailed now**  ${count}`,
    ].join('\n')));
    if (note) { b.addSeparatorComponents(ui.sep(false)); b.addTextDisplayComponents(ui.text(note)); }
    b.addSeparatorComponents(ui.sep(false));
    b.addTextDisplayComponents(ui.text(ui.sub(confirmReset
        ? `${J.WARN} This releases everyone and deletes the jailed role and the jail channel.`
        : 'Re-sync after adding channels or changing the role position.')));
    b.addActionRowComponents(confirmReset
        ? ui.row(ui.btn('jail_reset_yes', 'Yes, reset jail', { style: 'danger', disabled: busy }), ui.btn('jail_reset_no', 'Cancel', { disabled: busy }))
        : ui.row(ui.btn('jail_sync', 'Re-sync permissions', { style: 'primary', disabled: busy }), ui.btn('jail_reset', 'Reset jail', { style: 'danger', disabled: busy })));
    return b;
}

async function setupFlow(message) {
    const { guild } = message;
    if (!isAdmin(message.member)) return send(message, J.fail('You need the **Manage Server** permission.'));
    const missing = J.missingForSetup(guild);
    if (missing.length) return send(message, J.fail(`I need the **${missing.join('** and **')}** permission${missing.length > 1 ? 's' : ''}.`));

    const sent = await message.reply({ components: [await panel(guild)], flags: V2, allowedMentions: { parse: [] } });
    const col = sent.createMessageComponentCollector({ filter: ui.onlyUser(message.author.id), time: 120000 });
    const edit = async (i, state) => i.editReply({ components: [await panel(guild, state)], flags: V2 });

    col.on('collect', async (i) => {
        try {
            await i.deferUpdate();
            if (i.customId === 'jail_setup_cancel') { col.stop('closed'); return i.editReply({ components: [J.warn('Jail setup cancelled.')], flags: V2 }); }

            if (i.customId === 'jail_setup_go') {
                await edit(i, { busy: true, note: `${J.WARN} Setting things up…` });
                const r = await J.setup(guild);
                return edit(i, { note: `${J.TICK} Created <@&${r.role.id}> and <#${r.channel.id}>. ${r.done} channel${r.done === 1 ? '' : 's'} updated${r.failed ? `, ${r.failed} skipped (I lack access)` : ''}.` });
            }
            if (i.customId === 'jail_sync') {
                await edit(i, { busy: true, note: `${J.WARN} Syncing channel permissions…` });
                const r = await J.resync(guild);
                return edit(i, { note: r ? `${J.TICK} ${r.done} channel${r.done === 1 ? '' : 's'} updated${r.failed ? `, ${r.failed} skipped (I lack access)` : ''}.` : `${J.CROSS} The jailed role was deleted. Reset and set up again.` });
            }
            if (i.customId === 'jail_reset') return edit(i, { confirmReset: true });
            if (i.customId === 'jail_reset_no') return edit(i, {});
            if (i.customId === 'jail_reset_yes') {
                await edit(i, { confirmReset: true, busy: true, note: `${J.WARN} Resetting…` });
                const r = await J.reset(guild);
                col.stop('reset');
                return i.editReply({ components: [J.ok('Jail was reset.', `${r.released} member${r.released === 1 ? '' : 's'} released. Run \`jail setup\` to start again.`)], flags: V2 });
            }
        } catch (err) {
            console.error('[jail] setup error:', err);
            i.followUp({ components: [J.fail('Something went wrong.', err.message?.slice(0, 150))], flags: V2 | MessageFlags.Ephemeral }).catch(() => {});
        }
    });
    col.on('end', (_c, reason) => { if (reason === 'time') sent.edit({ components: [J.warn('Jail setup timed out.', 'Run `jail setup` again.')], flags: V2 }).catch(() => {}); });
}
