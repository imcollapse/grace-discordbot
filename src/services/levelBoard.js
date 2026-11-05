// grace · level leaderboard: top members by XP, paged, with the asker's own place at the bottom.

const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const { createPaginationSession } = require('./pagination');
const ui = require('./ui');
const L = require('./levels');
const db = require('../database/levels');

const PER_PAGE = 8;
const MEDAL = ['🥇', '🥈', '🥉'];

async function show(ctx) {
    const guild = ctx.guild;
    const userId = ctx.user?.id ?? ctx.author?.id;
    const total = await db.count(guild.id);
    if (!total) return ui.say.warning(ctx, 'Nobody has earned XP yet. Start chatting!');

    const s = await L.settings(guild.id);
    const me = await db.getUser(guild.id, userId);
    const mine = me && Number(me.xp) > 0 ? { rank: await db.rankOf(guild.id, Number(me.xp)), xp: Number(me.xp) } : null;

    const names = async (rows) => {
        const out = new Map();
        await Promise.all(rows.map(async (r) => {
            const m = guild.members.cache.get(r.user_id) ?? await guild.members.fetch(r.user_id).catch(() => null);
            out.set(r.user_id, m ?? (await ctx.client.users.fetch(r.user_id).catch(() => null)));
        }));
        return out;
    };

    const render = async (page, rows) => {
        const who = await names(rows);
        const c = new ContainerBuilder();
        const lines = rows.map((r, i) => {
            const rank = page * PER_PAGE + i + 1;
            const u = who.get(r.user_id);
            const name = u ? (u.displayName ?? u.username) : 'Unknown member';
            const xp = Number(r.xp);
            const lvl = L.levelFor(xp);
            const badge = rank <= 3 ? MEDAL[rank - 1] : `\`#${String(rank).padStart(2, ' ')}\``;
            return `${badge} **${name}**\n-# Level ${lvl} · ${xp.toLocaleString('en-US')} XP${Number(r.messages) ? ` · ${Number(r.messages).toLocaleString('en-US')} messages` : ''}`;
        });
        const head = `### ${guild.name} leaderboard\n-# ${total.toLocaleString('en-US')} ranked member${total === 1 ? '' : 's'}${s.cfg.enabled ? '' : ' · levels are currently off'}`;
        const icon = guild.iconURL({ size: 128 });
        if (icon) c.addSectionComponents(new SectionBuilder().addTextDisplayComponents(ui.text(head)).setThumbnailAccessory(new ThumbnailBuilder().setURL(icon)));
        else c.addTextDisplayComponents(ui.text(head));
        c.addSeparatorComponents(ui.sep()).addTextDisplayComponents(ui.text(lines.join('\n')));
        if (mine) c.addSeparatorComponents(ui.sep(false)).addTextDisplayComponents(ui.text(ui.sub(`You are #${mine.rank} · level ${L.levelFor(mine.xp)}`)));
        return c;
    };

    return createPaginationSession({
        interactionOrMessage: ctx,
        pages: (page) => db.top(guild.id, PER_PAGE, page * PER_PAGE),
        renderPage: render,
        userId,
        totalPages: Math.ceil(total / PER_PAGE),
    }).renderInitial();
}

module.exports = { show };
