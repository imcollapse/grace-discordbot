// grace · levels. Members earn XP by chatting and in voice, climb levels and unlock roles.
//   level [rank] [user] · top · info · setup · addreward <level> <role> · removereward <level|role>
//   ignore <#channel|@role> · boost <#channel|@role> <x> · set <user> level|xp <n> · reset [user] · sync · test

const {
    SlashCommandBuilder, PermissionFlagsBits: P, ChannelType: T, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ComponentType,
} = require('discord.js');
const ui = require('../../../services/ui');
const L = require('../../../services/levels');
const Panel = require('../../../services/levelPanel');
const Board = require('../../../services/levelBoard');
const { renderRank } = require('../../../services/levelCard');
const db = require('../../../database/levels');
const cards = require('../../../database/profileCards');

const NO_PING = { parse: [] };
const SUBS = ['rank', 'top', 'info', 'setup', 'addreward', 'removereward', 'ignore', 'boost', 'set', 'reset', 'sync', 'test'];
const ADMIN = new Set(['setup', 'addreward', 'removereward', 'ignore', 'boost', 'set', 'reset', 'sync', 'test']);
const ALIAS = { lb: 'top', leaderboard: 'top', board: 'top', rewards: 'info', roles: 'info', config: 'setup', settings: 'setup', panel: 'setup', add: 'addreward', remove: 'removereward', blacklist: 'ignore', multiplier: 'boost', preview: 'test' };
const TEXT_TYPES = [T.GuildText, T.GuildAnnouncement, T.GuildVoice, T.GuildStageVoice, T.GuildForum, T.GuildCategory];

const data = new SlashCommandBuilder().setName('level').setDescription('XP, levels, reward roles and the leaderboard')
    .addSubcommand((s) => s.setName('rank').setDescription('See a rank card')
        .addUserOption((o) => o.setName('user').setDescription('Whose card (defaults to you)')))
    .addSubcommand((s) => s.setName('top').setDescription('The server leaderboard'))
    .addSubcommand((s) => s.setName('info').setDescription('Reward roles, boosts and ignored places'))
    .addSubcommand((s) => s.setName('setup').setDescription('Turn levels on and design the level-up message (admins)'))
    .addSubcommand((s) => s.setName('addreward').setDescription('Give a role at a level (admins)')
        .addIntegerOption((o) => o.setName('level').setDescription('The level').setMinValue(1).setMaxValue(L.MAX_LEVEL).setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('The role').setRequired(true)))
    .addSubcommand((s) => s.setName('removereward').setDescription('Remove a reward role (admins)')
        .addIntegerOption((o) => o.setName('level').setDescription('The level it is set on').setMinValue(1).setMaxValue(L.MAX_LEVEL))
        .addRoleOption((o) => o.setName('role').setDescription('Or the role itself')))
    .addSubcommand((s) => s.setName('ignore').setDescription('Stop (or resume) counting a channel or role (admins)')
        .addChannelOption((o) => o.setName('channel').setDescription('A channel or category').addChannelTypes(...TEXT_TYPES))
        .addRoleOption((o) => o.setName('role').setDescription('A role whose members earn nothing')))
    .addSubcommand((s) => s.setName('boost').setDescription('Multiply XP for a role or channel (admins)')
        .addNumberOption((o) => o.setName('multiplier').setDescription('Like 2 for double. 1 removes the boost').setMinValue(0.1).setMaxValue(10).setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('Members with this role'))
        .addChannelOption((o) => o.setName('channel').setDescription('Chat in this channel or category').addChannelTypes(...TEXT_TYPES)))
    .addSubcommand((s) => s.setName('set').setDescription('Set a member\'s level or XP (admins)')
        .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true))
        .addIntegerOption((o) => o.setName('level').setDescription('Jump to this level').setMinValue(0).setMaxValue(L.MAX_LEVEL))
        .addIntegerOption((o) => o.setName('xp').setDescription('Or set the total XP').setMinValue(0)))
    .addSubcommand((s) => s.setName('reset').setDescription('Reset one member, or everyone if you leave the member out (admins)')
        .addUserOption((o) => o.setName('user').setDescription('The member')))
    .addSubcommand((s) => s.setName('sync').setDescription('Hand out reward roles to everyone who has earned them (admins)'))
    .addSubcommand((s) => s.setName('test').setDescription('Preview the level-up message (admins)'));

const reply = (ctx, text, kind = 'base') => ui.send(ctx, ui.notice(kind, text), { extra: { allowedMentions: NO_PING } });
const numIn = (args) => { const a = args.find((x) => /^\d+(\.\d+)?$/.test(x)); return a === undefined ? null : Number(a); };

function help(ctx) {
    const c = ui.box('base').addTextDisplayComponents(
        ui.text('### Levels'),
        ui.text('`level rank [user]` · `level top` · `level info`\n`rank` and `lb` work on their own, too'),
        ui.text('-# Admins: `level setup` · `addreward <level> <@role>` · `removereward` · `ignore <#channel|@role>` · `boost <#channel|@role> <x>` · `set` · `reset` · `sync` · `test`'),
    );
    return ui.send(ctx, c, { extra: { allowedMentions: NO_PING } });
}

/* ---------- rank ---------- */

async function rank(ctx, user, member) {
    const [row, s] = await Promise.all([db.getUser(ctx.guild.id, user.id), L.settings(ctx.guild.id)]);
    const xp = Number(row?.xp ?? 0);
    if (!xp && !s.cfg.enabled) return reply(ctx, 'Levels aren\'t turned on in this server. An admin can start with `level setup`', 'warning');
    if (!xp) return reply(ctx, user.id === (ctx.user ?? ctx.author).id ? 'You haven\'t earned any XP yet. Start chatting!' : `${user.username} hasn't earned any XP yet`, 'warning');

    const p = L.progress(xp);
    const card = await cards.get(user.id).catch(() => ({}));
    const buf = await renderRank({
        user: { name: member?.displayName ?? user.globalName ?? user.username, handle: user.username, avatar: (member ?? user).displayAvatarURL({ extension: 'png', size: 256 }) },
        theme: card?.theme, color: card?.color, level: p.level, rank: await db.rankOf(ctx.guild.id, xp), into: p.into, span: p.span, pct: p.pct,
        xp, messages: Number(row.messages), voiceSecs: Number(row.voice_secs),
    });
    const name = `rank-${user.id}.png`;
    const c = ui.box('base').addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`)));
    const next = s.rewards.find((r) => r.level > p.level);
    if (next) c.addTextDisplayComponents(ui.text(ui.sub(`Next reward <@&${next.role_id}> at level ${next.level} · ${(L.total(next.level) - xp).toLocaleString('en-US')} XP to go`)));
    return ui.send(ctx, c, { extra: { files: [new AttachmentBuilder(buf, { name })], allowedMentions: NO_PING } });
}

/* ---------- info ---------- */

async function info(ctx) {
    const s = await L.settings(ctx.guild.id);
    const rewards = s.rewards.length ? s.rewards.map((r) => `Level **${r.level}**  <@&${r.role_id}>`).join('\n') : ui.sub('None yet. Add one with `level addreward 5 @role`');
    const ign = [...[...s.ignoreChannels].map((id) => `<#${id}>`), ...[...s.ignoreRoles].map((id) => `<@&${id}>`)];
    const bst = [...[...s.boostChannels].map(([id, m]) => `<#${id}> ×${m}`), ...[...s.boostRoles].map(([id, m]) => `<@&${id}> ×${m}`)];
    const c = ui.box('base').addTextDisplayComponents(
        ui.text(`### Levels in ${ctx.guild.name}\n-# ${s.cfg.enabled ? 'On' : 'Off'} · ${s.cfg.xp_min}–${s.cfg.xp_max} XP per message · ${s.cfg.cooldown}s cooldown · voice XP ${s.cfg.voice ? 'on' : 'off'}`),
    ).addSeparatorComponents(ui.sep()).addTextDisplayComponents(
        ui.text(`**Reward roles** (${s.cfg.stack ? 'members keep all of them' : 'only the highest is kept'})\n${rewards}`),
    ).addSeparatorComponents(ui.sep(false)).addTextDisplayComponents(
        ui.text(`**XP boosts**\n${bst.length ? bst.join('  ') : ui.sub('none')}`),
        ui.text(`**Not counted**\n${ign.length ? ign.join('  ') : ui.sub('nothing ignored')}`),
    );
    return ui.send(ctx, c, { extra: { allowedMentions: NO_PING } });
}

/* ---------- reset everyone, with a confirmation ---------- */

async function confirmResetAll(ctx, actor) {
    const msg = await ui.send(ctx, ui.box('warning').addTextDisplayComponents(
        ui.text('### Reset everyone?\n-# This deletes all XP and levels in this server. Reward roles stay as they are.'),
    ).addActionRowComponents(ui.confirmRow('lvlreset', { yes: 'Reset everyone', danger: true })), { extra: { allowedMentions: NO_PING } });
    try {
        const i = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 30000, filter: (x) => x.user.id === actor.id && x.customId.startsWith('lvlreset') });
        if (i.customId.endsWith('_yes')) {
            await db.resetGuild(ctx.guild.id);
            return i.update({ components: [ui.success('Everyone\'s XP was reset')], flags: 1 << 15 });
        }
        return i.update({ components: [ui.info('Nothing was changed')], flags: 1 << 15 });
    } catch {
        return msg.edit({ components: [ui.info('Timed out, nothing was changed')] }).catch(() => {});
    }
}

/* ---------- command ---------- */

module.exports = {
    data, name: 'level', description: 'XP, levels, reward roles and the leaderboard',
    aliases: ['rank', 'lvl', 'levels', 'xp'], category: 'utility',

    async execute(ctx, args = []) {
        if (!ctx.guild) return ui.say.error(ctx, 'Use this in a server');
        const slash = !!ctx.isChatInputCommand?.();
        const actor = ctx.user ?? ctx.author;
        let sub = slash ? ctx.options.getSubcommand() : String(args[0] ?? '').toLowerCase();
        let rest = slash ? [] : args.slice(1);

        if (!slash) {
            sub = ALIAS[sub] ?? sub;
            if (!sub) sub = 'rank';
            if (!SUBS.includes(sub)) { sub = 'rank'; rest = args; }          // `rank @user` or `rank 1234`
        }

        if (ADMIN.has(sub) && !ctx.member?.permissions?.has(P.ManageGuild)) return ui.say.error(ctx, 'You need **Manage Server** for that');
        const bust = () => L.bust(ctx.guild.id);

        switch (sub) {
            case 'rank': {
                const user = slash ? (ctx.options.getUser('user') ?? actor)
                    : (ctx.mentions?.users?.first() ?? (/^\d{15,22}$/.test(rest[0] ?? '') ? await ctx.client.users.fetch(rest[0]).catch(() => null) : null) ?? actor);
                if (user.bot) return reply(ctx, 'Bots don\'t earn XP', 'warning');
                const member = ctx.guild.members.cache.get(user.id) ?? await ctx.guild.members.fetch(user.id).catch(() => null);
                return rank(ctx, user, member);
            }
            case 'top': return Board.show(ctx);
            case 'info': return info(ctx);
            case 'setup': {
                const [cfg, rewards] = await Promise.all([db.guild(ctx.guild.id), db.roles(ctx.guild.id)]);
                return ui.send(ctx, await Panel.panel(ctx.guild, cfg, rewards), { extra: { allowedMentions: NO_PING } });
            }
            case 'addreward': {
                const level = slash ? ctx.options.getInteger('level') : numIn(rest);
                const role = slash ? ctx.options.getRole('role') : ctx.mentions?.roles?.first();
                if (!level || level < 1 || level > L.MAX_LEVEL || !role) return ui.say.error(ctx, 'Use `level addreward 5 @role`');
                const me = ctx.guild.members.me;
                if (role.managed || role.id === ctx.guild.id) return ui.say.error(ctx, 'I can\'t hand out that role');
                if (role.position >= me.roles.highest.position) return ui.say.error(ctx, `${role} is above my highest role, so I couldn't give it. Move my role higher first`);
                if (!me.permissions.has(P.ManageRoles)) return ui.say.error(ctx, 'I need the **Manage Roles** permission');
                await db.addRole(ctx.guild.id, level, role.id); bust();
                return reply(ctx, `${role} is now the reward for **level ${level}**\n-# Use \`level sync\` to give it to members who are already past it`, 'success');
            }
            case 'removereward': {
                const level = slash ? ctx.options.getInteger('level') : numIn(rest);
                const role = slash ? ctx.options.getRole('role') : ctx.mentions?.roles?.first();
                if (!level && !role) return ui.say.error(ctx, 'Give a level or a role, like `level removereward 5`');
                const res = role ? await db.removeRoleById(ctx.guild.id, role.id) : await db.removeRole(ctx.guild.id, level);
                bust();
                return res.changes ? reply(ctx, 'Reward removed. Members keep roles they already have', 'success') : reply(ctx, 'No reward matched that', 'warning');
            }
            case 'ignore': {
                const ch = slash ? ctx.options.getChannel('channel') : ctx.mentions?.channels?.first();
                const role = slash ? ctx.options.getRole('role') : ctx.mentions?.roles?.first();
                if (!ch && !role) return ui.say.error(ctx, 'Mention a channel or a role, like `level ignore #spam`');
                const target = ch ?? role;
                const now = await db.toggleIgnore(ctx.guild.id, ch ? 'channel' : 'role', target.id); bust();
                return reply(ctx, now ? `${target} no longer earns XP` : `${target} earns XP again`, 'success');
            }
            case 'boost': {
                const ch = slash ? ctx.options.getChannel('channel') : ctx.mentions?.channels?.first();
                const role = slash ? ctx.options.getRole('role') : ctx.mentions?.roles?.first();
                const mult = slash ? ctx.options.getNumber('multiplier') : numIn(rest.filter((x) => !/^<[@#]/.test(x)));
                if ((!ch && !role) || !mult || mult < 0.1 || mult > 10) return ui.say.error(ctx, 'Use `level boost @role 2` (0.1 to 10, and 1 removes it)');
                const target = ch ?? role;
                await db.setBoost(ctx.guild.id, ch ? 'channel' : 'role', target.id, mult); bust();
                return reply(ctx, mult === 1 ? `${target} has no boost now` : `${target} now earns **×${mult}** XP`, 'success');
            }
            case 'set': {
                const user = slash ? ctx.options.getUser('user') : ctx.mentions?.users?.first();
                if (!user || user.bot) return ui.say.error(ctx, 'Mention a member, like `level set @user level 10`');
                let level = slash ? ctx.options.getInteger('level') : null;
                let xp = slash ? ctx.options.getInteger('xp') : null;
                if (!slash) {
                    const kind = rest.find((x) => ['level', 'lvl', 'xp'].includes(x.toLowerCase()))?.toLowerCase();
                    const n = numIn(rest.filter((x) => !/^<@/.test(x)));
                    if (kind && n !== null) { if (kind === 'xp') xp = n; else level = n; }
                }
                if (level === null && xp === null) return ui.say.error(ctx, 'Give a level or XP: `level set @user level 10` or `level set @user xp 5000`');
                if (level !== null) xp = L.total(Math.min(level, L.MAX_LEVEL));
                const lvl = L.levelFor(xp);
                await db.setUser(ctx.guild.id, user.id, xp, lvl);
                const member = ctx.guild.members.cache.get(user.id) ?? await ctx.guild.members.fetch(user.id).catch(() => null);
                if (member) await L.syncRoles(member, lvl);
                return reply(ctx, `${user} is now **level ${lvl}** with **${xp.toLocaleString('en-US')} XP**`, 'success');
            }
            case 'reset': {
                const user = slash ? ctx.options.getUser('user') : ctx.mentions?.users?.first();
                if (user) { await db.resetUser(ctx.guild.id, user.id); return reply(ctx, `${user}'s XP was reset`, 'success'); }
                return confirmResetAll(ctx, actor);
            }
            case 'sync': {
                const s = await L.settings(ctx.guild.id);
                if (!s.rewards.length) return reply(ctx, 'There are no reward roles to give. Add one with `level addreward 5 @role`', 'warning');
                const rows = await db.top(ctx.guild.id, 400, 0);
                let done = 0;
                for (const r of rows) {
                    const m = ctx.guild.members.cache.get(r.user_id) ?? await ctx.guild.members.fetch(r.user_id).catch(() => null);
                    if (!m || m.user.bot) continue;
                    await L.syncRoles(m, L.levelFor(Number(r.xp)), s);
                    done++;
                    await new Promise((res) => setTimeout(res, 120));
                }
                return reply(ctx, `Checked the roles of **${done}** member${done === 1 ? '' : 's'}`, 'success');
            }
            case 'test': {
                const [cfg, rewards] = await Promise.all([db.guild(ctx.guild.id), db.roles(ctx.guild.id)]);
                const member = ctx.member ?? await ctx.guild.members.fetch(actor.id);
                const out = await L.build(ctx.guild, cfg, await Panel.sample(member, ctx.channel, rewards));
                if (!out.payload) return ui.say.error(ctx, out.problem ?? 'Nothing to send');
                const body = { ...out.payload, allowedMentions: NO_PING };
                if (out.problem) await reply(ctx, out.problem, 'warning');
                return slash ? (ctx.replied ? ctx.followUp({ ...body, flags: (body.flags ?? 0) | 64 }) : ctx.reply({ ...body, flags: (body.flags ?? 0) | 64 })) : ctx.reply(body);
            }
            default: return help(ctx);
        }
    },
};
