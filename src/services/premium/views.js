// Premium — Components V2 containers. Small `-#` lines, **bold** labels, `>` blocks and `-` lists.
// The icons are custom emojis from media/emojis.json (premium, premium_server, premium_user, premium_branding);
// while those are not filled in the cards simply show no icon.

const { MessageFlags } = require('discord.js');
const ui = require('../ui');
const config = require('../../settings');
const { icon } = require('../icons');
const P = require('./index');

const V2 = MessageFlags.IsComponentsV2;
const EPH = MessageFlags.Ephemeral;
const COLOR = {};   // containers are clean, so there is no accent to pick

const BUY_URL = config.PREMIUM_URL || config.SUPPORT_SERVER;
const ts = (d, s = 'F') => `<t:${Math.floor(new Date(d).getTime() / 1000)}:${s}>`;
const box = () => ui.box('base');
const FALLBACK_ICON = 'https://cdn.discordapp.com/embed/avatars/0.png';
const pic = (guild) => guild?.iconURL?.({ extension: 'png', size: 128 })
    || guild?.client?.user?.displayAvatarURL?.({ extension: 'png', size: 128 })
    || FALLBACK_ICON;

/** The custom premium emoji (or one of the three plan emojis), with a trailing space, or nothing. */
const gem = (key = 'premium') => { const v = icon(key, '') || icon('premium', ''); return v ? `${v} ` : ''; };
const kindGem = (kind) => gem(P.KINDS[kind]?.emoji);

/* ── what each plan gives ──────────────────────────────────────────── */

const PLANS = {
    server: {
        about: 'Everything extra for one server, branding included.',
        lines: () => [
            `**${P.perks.embeds.premium}** saved embeds and containers, instead of ${P.perks.embeds.free}`,
            `Up to **${P.perks.welcomeChannels.premium}** extra welcome channels, each with its own message`,
            'Its own bot avatar, banner and bio',
            'The server owner also gets every **User Premium** perk',
        ],
    },
    user: {
        about: 'Perks that follow you into every server.',
        lines: () => [
            `Family size of **${P.perks.children.premium}** children, instead of ${P.perks.children.free}`,
            `**${P.perks.economy.premium}x** economy rewards, once the economy ships`,
            'No captcha on lookup, vanity and usernames',
            'More snapshot slots',
        ],
    },
    branding: {
        about: 'Only the bot profile for one server.',
        lines: () => ['Its own bot avatar, banner and bio', 'Nothing else is unlocked'],
    },
};

const planBlock = (kind, state = null) => {
    const p = PLANS[kind];
    return [
        `### ${kindGem(kind)}${P.KINDS[kind].label}`,
        `> ${p.about}`,
        ...p.lines().map((l) => `- ${l}`),
        state ? `-# ${state}` : null,
    ].filter(Boolean).join('\n');
};

/** One line about a plan's state, for the overview. */
const stateLine = (st, none = 'Not active') => (st?.active
    ? (st.permanent ? 'Active  ·  never expires' : `Active  ·  ends ${ts(st.expiresAt, 'R')}`)
    : st?.expired ? 'Ended' : none);

const links = (label = 'Get premium') => ui.row(ui.link(label, BUY_URL), ui.link('Support server', config.SUPPORT_SERVER));

/* ── building blocks ───────────────────────────────────────────────── */

const head = (title, sub, thumb) => ui.section(`-# ${gem()}PREMIUM\n## ${title}${sub ? `\n-# ${sub}` : ''}`, thumb);

const notice = (kind, title, body = '') => {
    const tag = { ok: 'DONE', bad: 'NOT ALLOWED', warn: 'HEADS UP', info: 'INFO' }[kind] ?? 'INFO';
    const b = box().addTextDisplayComponents(ui.text(`-# ${gem()}${tag}\n### ${title}`));
    if (body) b.addTextDisplayComponents(ui.text(body));
    return b;
};

/* ── overview ──────────────────────────────────────────────────────── */

/**
 * `premium` with no subcommand.
 *   guild/status   this server (null in DMs)      mine  { user, branding, srv, sources }
 */
function overview(guild, status, { canTrial, isOwner, mine }) {
    const b = box();
    b.addSectionComponents(head('Grace Premium', 'Three plans. Pick only what you need.', pic(guild)));
    b.addSeparatorComponents(ui.sep(true, true));
    b.addTextDisplayComponents(ui.text(planBlock('server', guild ? `${guild.name}: ${stateLine(status)}` : null)));
    b.addSeparatorComponents(ui.sep());
    b.addTextDisplayComponents(ui.text(planBlock('user', `You: ${mine?.user?.active ? stateLine(mine.user) : mine?.viaServer ? 'Active through your premium server' : 'Not active'}`)));
    b.addSeparatorComponents(ui.sep());
    b.addTextDisplayComponents(ui.text(planBlock('branding', guild ? `${guild.name}: ${mine?.branding?.active ? stateLine(mine.branding) : status.active ? 'Included with Server Premium' : 'Not active'}` : null)));
    if (guild && !status.active) {
        b.addSeparatorComponents(ui.sep());
        b.addTextDisplayComponents(ui.text(
            canTrial ? `**Try Server Premium free**\n-# Run \`premium trial\` for ${P.TRIAL_DAYS} days`
                : isOwner ? `-# This server's free trial has been used.`
                    : `-# The server owner can start a ${P.TRIAL_DAYS}-day free trial with \`premium trial\`.`));
    }
    return b.addActionRowComponents(links());
}

/** `premium me`: just the person's own plans. */
function myPlans(user, mine) {
    const src = mine.sources;
    const via = [
        mine.user?.active ? `User Premium  ·  ${stateLine(mine.user)}` : null,
        src?.server ? 'A premium server you own' : null,
        src?.noprefix ? 'No-prefix perk' : null,
    ].filter(Boolean);
    const on = via.length > 0;
    const b = box();
    b.addSectionComponents(head('Your premium', on ? 'User perks are on' : 'User perks are off', user.displayAvatarURL?.({ extension: 'png', size: 128 }) ?? FALLBACK_ICON));
    b.addSeparatorComponents(ui.sep());
    b.addTextDisplayComponents(ui.text(
        on ? `**Active through**\n${via.map((v) => `- ${v}`).join('\n')}\n\n**You get**\n${PLANS.user.lines().map((l) => `- ${l}`).join('\n')}`
            : `> You do not have User Premium yet.\n\n**It gives**\n${PLANS.user.lines().map((l) => `- ${l}`).join('\n')}`));
    return b.addActionRowComponents(links());
}

/* ── trial ─────────────────────────────────────────────────────────── */

function trialStarted(guild, status) {
    return box()
        .addSectionComponents(head('Trial started', guild.name, pic(guild)))
        .addSeparatorComponents(ui.sep(true, true))
        .addTextDisplayComponents(ui.text(
            `**${guild.name}** has **Server Premium** for **${P.TRIAL_DAYS} days**.\n-# Ends ${ts(status.expiresAt, 'F')}  ·  ${ts(status.expiresAt, 'R')}`))
        .addSeparatorComponents(ui.sep())
        .addTextDisplayComponents(ui.text(`**What you unlocked**\n${PLANS.server.lines().map((l) => `- ${l}`).join('\n')}`))
        .addSeparatorComponents(ui.sep())
        .addTextDisplayComponents(ui.text('-# Try `serveravatar`, `serverbanner` and `serverbio`, or add a welcome channel with `welcome addchannel`.'))
        .addActionRowComponents(links('Keep premium'));
}

/** Sent to the server owner when the trial (or a grant) runs out. */
function ended(guild, { source }) {
    const trial = source === 'trial';
    return box()
        .addSectionComponents(head(trial ? 'Your trial has ended' : 'Your premium has ended', guild.name, pic(guild)))
        .addSeparatorComponents(ui.sep(true, true))
        .addTextDisplayComponents(ui.text(
            trial ? `> Thanks for trying **Server Premium** on **${guild.name}**. Every free feature keeps working.`
                : `> **Server Premium** on **${guild.name}** has run out. Every free feature keeps working.`))
        .addSeparatorComponents(ui.sep())
        .addTextDisplayComponents(ui.text(
            '**What changes now**\n' +
            '- The bot avatar, banner and bio can no longer be changed here. What is set stays\n' +
            `- Saved embeds and containers go back to ${P.perks.embeds.free}. Extra ones are kept\n` +
            '- Extra welcome channels pause and resume with premium\n' +
            `- Family size returns to ${P.perks.children.free} children`))
        .addSeparatorComponents(ui.sep())
        .addTextDisplayComponents(ui.text(
            '**How to get premium**\n' +
            '- Join the support server with the button below\n' +
            '- Open a ticket and pick a plan\n' +
            `- Send your server ID: \`${guild.id}\`\n` +
            '-# It is switched on right away.'))
        .addActionRowComponents(links('Get premium'));
}

/* ── upsell / errors ───────────────────────────────────────────────── */

/** `need` says which plans unlock it. */
function locked(feature, { canTrial = false, need = 'server' } = {}) {
    const plans = need === 'branding' ? 'Branding Premium or Server Premium' : 'Server Premium';
    return box()
        .addTextDisplayComponents(ui.text(`-# ${gem()}PREMIUM\n### ${feature}\n> This needs **${plans}**.`))
        .addSeparatorComponents(ui.sep(false))
        .addTextDisplayComponents(ui.text(
            `${canTrial ? `The server owner can try it free for ${P.TRIAL_DAYS} days with \`premium trial\`.\n` : ''}-# See every plan with \`premium\`.`))
        .addActionRowComponents(links());
}

function trialDenied(reason, status) {
    switch (reason) {
        case 'not_owner': return notice('bad', 'Only the server owner can start the trial', '-# Ask the owner to run `premium trial`.');
        case 'active': return notice('info', 'Premium is already active', status.expiresAt ? `-# Ends ${ts(status.expiresAt, 'R')}` : '-# It never expires.');
        case 'used': return notice('warn', 'This server already used its trial', '> Each server gets one free trial.').addActionRowComponents(links());
        default: return notice('warn', 'You already used your trial', '> The free trial is once per server owner.').addActionRowComponents(links());
    }
}

/* ── owner tools ───────────────────────────────────────────────────── */

function statusView(guild, status, usage = {}, extra = {}) {
    const name = guild?.name || status.row?.guildName || 'Unknown server';
    const id = guild?.id || status.row?.guildId || 'unknown';
    const state = status.active
        ? (status.permanent ? 'Permanent' : `Until ${ts(status.expiresAt, 'F')}  (${ts(status.expiresAt, 'R')})`)
        : status.expired ? `Ended ${ts(status.expiresAt, 'R')}` : 'Never had premium';
    const lines = [
        `**Server Premium**  ${status.active ? 'Active' : status.expired ? 'Ended' : 'None'}`,
        `> ${state}`,
        status.row ? `**Source**  ${status.source === 'trial' ? 'Free trial' : 'Granted by the bot owner'}` : null,
        status.row ? `**Started**  ${ts(status.startedAt, 'f')}` : null,
        status.ownerId ? `**Owner**  <@${status.ownerId}>` : null,
        status.row ? `**Trial used**  ${status.trialUsed ? 'Yes' : 'No'}` : null,
        `**Branding Premium**  ${extra.branding?.active ? stateLine(extra.branding) : 'None'}`,
    ].filter(Boolean).join('\n');
    const b = box().addSectionComponents(head('Status', `${name}  ·  ${id}`, pic(guild))).addSeparatorComponents(ui.sep()).addTextDisplayComponents(ui.text(lines));
    if (usage.embeds != null) {
        b.addSeparatorComponents(ui.sep());
        b.addTextDisplayComponents(ui.text(
            `**Usage**\n- Embeds  ${usage.embeds}/${usage.limitEmbeds}\n- Containers  ${usage.containers}/${usage.limitContainers}\n- Extra welcome channels  ${usage.welcome}/${usage.limitWelcome}`));
    }
    return b;
}

/** Status of one user, for `premium status @user`. */
function userStatusView(user, mine) {
    const via = [mine.user?.active ? `User Premium  ·  ${stateLine(mine.user)}` : null, mine.sources?.server ? 'Owns a premium server' : null, mine.sources?.noprefix ? 'No-prefix perk' : null].filter(Boolean);
    return box()
        .addSectionComponents(head('Status', `${user.username ?? user.id}  ·  ${user.id}`, user.displayAvatarURL?.({ extension: 'png', size: 128 }) ?? FALLBACK_ICON))
        .addSeparatorComponents(ui.sep())
        .addTextDisplayComponents(ui.text(via.length ? `**User perks  Active**\n${via.map((v) => `- ${v}`).join('\n')}` : '**User perks  None**'));
}

function granted(kind, name, status, label) {
    return box()
        .addTextDisplayComponents(ui.text(`-# ${kindGem(kind)}${P.KINDS[kind].label.toUpperCase()}\n### Added\n> **${name}**  ·  ${label}`))
        .addSeparatorComponents(ui.sep(false))
        .addTextDisplayComponents(ui.text(status.permanent ? '-# Never expires.' : `-# Ends ${ts(status.expiresAt, 'F')}  ·  ${ts(status.expiresAt, 'R')}`));
}

const revoked = (kind, name) => notice('ok', `${P.KINDS[kind].label} removed`, `> **${name}** no longer has it.`);

/** A page of everyone who has a plan. */
function listView(rows) {
    const line = (r) => `- ${r.k} **${r.name}**  ·  ${r.until}`;
    const b = box().addTextDisplayComponents(ui.text(`-# ${gem()}PREMIUM\n## Active plans\n-# ${rows.length} total`));
    b.addSeparatorComponents(ui.sep());
    b.addTextDisplayComponents(ui.text(rows.length ? rows.slice(0, 20).map(line).join('\n') : '> Nothing is active yet.'));
    if (rows.length > 20) b.addTextDisplayComponents(ui.text(`-# and ${rows.length - 20} more`));
    return b;
}

/* ── sending ───────────────────────────────────────────────────────── */

/** Reply to a slash interaction or a prefix message. Ephemeral is real on slash, self-deleting on prefix. */
async function send(ctx, components, { ephemeral = false, slashOnly = false } = {}) {
    const list = Array.isArray(components) ? components : [components];
    const slash = typeof ctx.isChatInputCommand === 'function' && ctx.isChatInputCommand();
    if (slash) {
        const flags = V2 | (ephemeral || slashOnly ? EPH : 0);
        if (ctx.deferred || ctx.replied) return ctx.editReply({ components: list, flags: V2 }).catch(() => ctx.followUp({ components: list, flags }));
        return ctx.reply({ components: list, flags, allowedMentions: { parse: [] } });
    }
    const m = await ctx.reply({ components: list, flags: V2, allowedMentions: { parse: [], repliedUser: false } });
    if (ephemeral) setTimeout(() => m?.delete?.().catch(() => {}), 15000).unref?.();
    return m;
}

/**
 * Stop a premium-only action: shows the upsell and returns false when the server does not have the plan.
 * need: 'server' (default) or 'branding' (Branding Premium also unlocks it).
 */
async function gate(ctx, feature, { need = 'server' } = {}) {
    if (!ctx.guild) return false;
    const status = await P.guildStatus(ctx.guild.id);
    if (status.active) return true;
    if (need === 'branding' && (await P.hasBranding(ctx.guild.id))) return true;
    await send(ctx, locked(feature, { canTrial: !status.trialUsed, need }), { ephemeral: true });
    return false;
}

/* ── small upsell under a reply ────────────────────────────────────── */

const seen = new Map();   // user:topic -> last shown, so it never repeats on every command

/**
 * A small message under a command that has premium benefits, with a button to buy.
 * Does nothing when the person or server already has the plan, or it was shown a moment ago.
 *   plan   'server' | 'user' | 'branding'     line   the one sentence of benefit (markdown allowed)
 */
async function nudge(ctx, { plan = 'server', topic, line }) {
    try {
        const user = ctx.user ?? ctx.author;
        if (!user) return;
        if (plan === 'user' ? await P.isUserPremium(user.id)
            : plan === 'branding' ? await P.hasBranding(ctx.guild?.id) : await P.isGuildPremium(ctx.guild?.id)) return;
        const key = `${user.id}:${topic}`;
        if (Date.now() - (seen.get(key) ?? 0) < 60000) return;
        seen.set(key, Date.now());
        if (seen.size > 500) seen.delete(seen.keys().next().value);

        const c = box().addSectionComponents(
            new (require('discord.js').SectionBuilder)()
                .addTextDisplayComponents(ui.text(`-# ${kindGem(plan)}${P.KINDS[plan].label.toUpperCase()}\n${line}`))
                .setButtonAccessory(ui.link('Get premium', BUY_URL)));
        const slash = typeof ctx.isChatInputCommand === 'function' || typeof ctx.isRepliable === 'function';
        if (slash) {
            if (!ctx.deferred && !ctx.replied) return;
            return await ctx.followUp({ components: [c], flags: V2 | EPH, allowedMentions: { parse: [] } });
        }
        return await ctx.channel.send({ components: [c], flags: V2, allowedMentions: { parse: [], repliedUser: false } });
    } catch (e) { console.error('[premium] nudge:', e.message); }
}

module.exports = {
    nudge, gate, links, V2, EPH, COLOR, BUY_URL, gem,
    trialStarted, ended, locked, notice, trialDenied, overview, myPlans, statusView, userStatusView, granted, revoked, listView, send,
};
