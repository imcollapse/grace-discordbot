// grace — premium (hybrid). Three plans: server, user and branding.
//   premium                      the three plans and what you have
//   premium me                   your own plans
//   premium trial                3 days of Server Premium (server owner only, once)
//   premium status [id]          state of a server, or of a user (bot owner)
//   premium add <plan> <1d|1w|1m|1y|permanent> [id]      give a plan (bot owner)    plan: server | user | branding
//   premium remove <plan> [id]   take it away (bot owner)
//   premium list                 everyone who has a plan (bot owner)

const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../settings');
const P = require('../../../services/premium');
const V = require('../../../services/premium/views');

const LENGTHS = [['1 week', '7d'], ['1 month', '30d'], ['3 months', '90d'], ['6 months', '180d'], ['1 year', '365d'], ['Permanent', 'permanent']];
const KIND_CHOICES = [['Server Premium', 'server'], ['User Premium', 'user'], ['Branding Premium', 'branding']];
const ID = /^\d{17,20}$/;
const MENTION = /^<@!?(\d{17,20})>$/;

const isSlash = (c) => typeof c.isChatInputCommand === 'function' && c.isChatInputCommand();
const userOf = (c) => (isSlash(c) ? c.user : c.author);
const idOf = (s) => (s ? (s.match(MENTION)?.[1] ?? (ID.test(s) ? s : null)) : null);

const choices = (o, list) => o.addChoices(...list.map(([name, value]) => ({ name, value })));

// Prefix-only on purpose: Discord allows 100 global slash commands and this bot is close to that.
// To get `/premium` back once there is room, rename `slashData` to `data`.
module.exports = {
    slashData: new SlashCommandBuilder()
        .setName('premium')
        .setDescription('Premium plans, free trial and owner tools')
        .addSubcommand((s) => s.setName('info').setDescription('See the plans and what you have'))
        .addSubcommand((s) => s.setName('me').setDescription('Your own premium plans'))
        .addSubcommand((s) => s.setName('trial').setDescription(`Start a free ${P.TRIAL_DAYS}-day Server Premium trial (server owner only)`))
        .addSubcommand((s) => s.setName('status').setDescription('State of a server or user (bot owner)')
            .addStringOption((o) => o.setName('id').setDescription('Server or user ID (default: this server)')))
        .addSubcommand((s) => s.setName('add').setDescription('Give a plan (bot owner)')
            .addStringOption((o) => choices(o.setName('plan').setDescription('Which plan').setRequired(true), KIND_CHOICES))
            .addStringOption((o) => choices(o.setName('length').setDescription('How long').setRequired(true), LENGTHS))
            .addStringOption((o) => o.setName('id').setDescription('Server or user ID (default: this server, or you)')))
        .addSubcommand((s) => s.setName('remove').setDescription('Take a plan away (bot owner)')
            .addStringOption((o) => choices(o.setName('plan').setDescription('Which plan').setRequired(true), KIND_CHOICES))
            .addStringOption((o) => o.setName('id').setDescription('Server or user ID (default: this server, or you)')))
        .addSubcommand((s) => s.setName('list').setDescription('Everyone who has a plan (bot owner)')),

    name: 'premium',
    description: 'Premium plans: server, user and branding',
    aliases: ['prem'],
    category: 'general',
    usage: '(me | trial | status [id] | add <server|user|branding> <1d|1w|1m|1y|permanent> [id] | remove <plan> [id] | list)',

    async execute(ctx, args = []) {
        const slash = isSlash(ctx);
        const sub = slash ? ctx.options.getSubcommand() : (args[0] || 'info').toLowerCase();
        const rest = slash ? [] : args.slice(1);
        const user = userOf(ctx);
        const reply = (c, o) => V.send(ctx, c, o);

        try {
            if (sub === 'trial') return await trial(ctx, user, reply);
            if (sub === 'me') return reply(V.myPlans(user, await mineOf(user.id, ctx.guild?.id)));
            if (['status', 'add', 'remove', 'list'].includes(sub)) {
                if (user.id !== config.OWNER_ID) return reply(V.notice('bad', 'Owner only', '-# Only the bot owner can use this.'), { ephemeral: true });
                return await ownerTools(ctx, sub, rest, slash, reply, user);
            }
            if (!ctx.guild) return reply(V.myPlans(user, await mineOf(user.id, null)));
            const status = await P.guildStatus(ctx.guild.id);
            const isOwner = ctx.guild.ownerId === user.id;
            return reply(V.overview(ctx.guild, status, { canTrial: isOwner && !status.active && !status.trialUsed, isOwner, mine: await mineOf(user.id, ctx.guild.id) }));
        } catch (err) {
            console.error('[premium]', err);
            try { return await reply(V.notice('bad', 'Something went wrong', '-# Please try again in a moment.'), { ephemeral: true }); } catch (_) { return undefined; }
        }
    },
};

/** Everything a person has: their user plan, the sources of their user perks, and branding for a server. */
async function mineOf(userId, guildId) {
    const [userPass, branding, sources] = await Promise.all([P.passStatus('user', userId), guildId ? P.passStatus('branding', guildId) : null, P.userSources(userId)]);
    return { user: userPass, branding, sources, viaServer: sources.server };
}

async function trial(ctx, user, reply) {
    if (!ctx.guild) return reply(V.notice('bad', 'Servers only', '-# Run this inside the server you own.'), { ephemeral: true });
    const r = await P.startTrial(ctx.guild, user.id);
    if (!r.ok) return reply(V.trialDenied(r.reason, r.status), { ephemeral: true });
    return reply(V.trialStarted(ctx.guild, r.status));
}

async function ownerTools(ctx, sub, rest, slash, reply, user) {
    const warn = (t, b) => reply(V.notice('warn', t, b), { ephemeral: true });

    if (sub === 'list') {
        const [servers, passes] = await Promise.all([P.listAll(), P.listPasses()]);
        const rows = [
            ...servers.filter((r) => P.live(r)).map((r) => ({ k: V.gem('premium_server'), name: r.guildName || r.guildId, until: r.expiresAt ? `<t:${Math.floor(new Date(r.expiresAt).getTime() / 1000)}:R>` : 'permanent' })),
            ...passes.filter((r) => P.live(r)).map((r) => ({ k: V.gem(r.kind === 'user' ? 'premium_user' : 'premium_branding'), name: r.targetName || r.targetId, until: r.expiresAt ? `<t:${Math.floor(new Date(r.expiresAt).getTime() / 1000)}:R>` : 'permanent' })),
        ];
        return reply(V.listView(rows));
    }

    // plan word (add / remove) and the id given
    let kind = slash ? ctx.options.getString('plan') : null;
    let idArg = slash ? ctx.options.getString('id') : null;
    let lengthArg = slash ? ctx.options.getString('length') : null;
    if (!slash) {
        const words = [...rest];
        const k = words.findIndex((w) => ['server', 'user', 'branding'].includes(w.toLowerCase()));
        if (k >= 0) kind = words.splice(k, 1)[0].toLowerCase();
        idArg = words.find((w) => idOf(w)) ?? null;
        lengthArg = words.find((w) => w !== idArg) ?? null;
    }
    const target = idOf(idArg);

    if (sub === 'status') {
        // a mention is a user; a bare id is a server unless it is a known user... try server first, then user
        if (kind === 'user' || (target && /^<@/.test(idArg)) || (target && !ctx.client.guilds.cache.has(target) && !(await P.guildStatus(target)).row && ctx.client.users.cache.has(target))) {
            const uid = target ?? user.id;
            const u = await ctx.client.users.fetch(uid).catch(() => ({ id: uid, username: uid }));
            return reply(V.userStatusView(u, await mineOf(uid, null)));
        }
        const guildId = target || ctx.guild?.id;
        if (!guildId) return warn('Which server?', '-# Give a server ID, or run this inside a server.');
        const guild = ctx.client.guilds.cache.get(guildId) || null;
        const status = await P.guildStatus(guildId);
        let usage = {};
        if (guild) {
            const { Embed, Container, GreetingChannel } = require('../../../database/schemas');
            const [e, c, w, lim] = await Promise.all([Embed.count({ where: { guildId } }), Container.count({ where: { guildId } }), GreetingChannel.count({ where: { guildId } }), P.slots(guildId)]);
            usage = { embeds: e, containers: c, welcome: w, limitEmbeds: lim.embeds, limitContainers: lim.containers, limitWelcome: P.perks.welcomeChannels.premium };
        }
        return reply(V.statusView(guild, status, usage, { branding: await P.passStatus('branding', guildId) }));
    }

    // add / remove
    if (!kind) kind = 'server';                          // `premium add 30d` still means a server
    if (!P.KINDS[kind]) return warn('Pick a plan', '-# Use `server`, `user` or `branding`.');

    let who;                                             // { id, name }
    if (kind === 'user') {
        const uid = target ?? user.id;
        const u = await ctx.client.users.fetch(uid).catch(() => null);
        if (!u) return warn('I can\'t find that user', '-# Give a user ID or mention.');
        who = { id: u.id, name: u.username };
    } else {
        const guildId = target || ctx.guild?.id;
        const guild = guildId && ctx.client.guilds.cache.get(guildId);
        if (!guild) return warn('I\'m not in that server', '-# Invite the bot there first, or give a server ID.');
        who = { id: guild.id, name: guild.name, guild };
    }

    if (sub === 'add') {
        const ms = P.parseLength(lengthArg ?? '');
        if (ms === undefined) return warn('Pick a length', '-# Use `1d`, `1w`, `1m`, `1y` or `permanent`.\n-# Example: `premium add user 30d @someone`');
        const status = kind === 'server' ? await P.grant(who.guild, { ms, by: user.id }) : await P.grantPass(kind, { id: who.id, name: who.name }, { ms, by: user.id });
        return reply(V.granted(kind, who.name, status, P.lengthLabel(ms)));
    }

    const ok = kind === 'server' ? await P.revoke(who.id) : await P.revokePass(kind, who.id);
    return ok ? reply(V.revoked(kind, who.name)) : warn('Nothing to remove', `> **${who.name}** does not have active ${P.KINDS[kind].label}.`);
}
