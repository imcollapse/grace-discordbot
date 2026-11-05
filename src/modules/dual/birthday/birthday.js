// grace · birthday. Members save their birthday; admins turn announcements on with `birthday enable`.
//   birthday set 14 mar [2005] · view [user] · remove · upcoming
//   admins: enable [#channel] · disable · channel #x · message <text|reset> · ping on|off · timezone +5:30 · test · settings

const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType: T } = require('discord.js');
const ui = require('../../../services/ui');
const B = require('../../../services/birthday');
const db = require('../../../database/birthdays');
const { icon } = require('../../../services/icons');

const NO_PING = { parse: [] };
const SUBS = ['set', 'view', 'remove', 'upcoming', 'enable', 'disable', 'channel', 'message', 'ping', 'timezone', 'test', 'settings'];
const ADMIN = new Set(['enable', 'disable', 'channel', 'message', 'ping', 'timezone', 'test', 'settings']);
const TEXT_TYPES = [T.GuildText, T.GuildAnnouncement];

const data = new SlashCommandBuilder().setName('birthday').setDescription('Save your birthday and get wished in servers that turn it on')
    .addSubcommand((s) => s.setName('set').setDescription('Save your birthday')
        .addStringOption((o) => o.setName('date').setDescription('Like 14 mar, 14/03 or 14 mar 2005 (the year is optional)').setRequired(true)))
    .addSubcommand((s) => s.setName('view').setDescription('See a birthday')
        .addUserOption((o) => o.setName('user').setDescription('Whose (defaults to you)')))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove your birthday'))
    .addSubcommand((s) => s.setName('upcoming').setDescription('The next birthdays in this server'))
    .addSubcommand((s) => s.setName('enable').setDescription('Turn birthday wishes on (admins)')
        .addChannelOption((o) => o.setName('channel').setDescription('Where to post (defaults to this channel)').addChannelTypes(...TEXT_TYPES)))
    .addSubcommand((s) => s.setName('disable').setDescription('Turn birthday wishes off (admins)'))
    .addSubcommand((s) => s.setName('channel').setDescription('Change the wishes channel (admins)')
        .addChannelOption((o) => o.setName('channel').setDescription('The channel').addChannelTypes(...TEXT_TYPES).setRequired(true)))
    .addSubcommand((s) => s.setName('message').setDescription('Change the wish text (admins)')
        .addStringOption((o) => o.setName('text').setDescription('Use {user} {name} {age} {server}. Type reset for the default').setRequired(true).setMaxLength(500)))
    .addSubcommand((s) => s.setName('ping').setDescription('Ping the birthday member or not (admins)')
        .addBooleanOption((o) => o.setName('enabled').setDescription('On or off').setRequired(true)))
    .addSubcommand((s) => s.setName('timezone').setDescription('Time zone for this server\'s birthdays (admins)')
        .addStringOption((o) => o.setName('offset').setDescription('Like +5:30, -8 or UTC').setRequired(true)))
    .addSubcommand((s) => s.setName('test').setDescription('Preview the wish with your own birthday (admins)'))
    .addSubcommand((s) => s.setName('settings').setDescription('See the birthday settings (admins)'));

const say = (ctx, text, kind = 'base') => ui.send(ctx, ui.notice(kind, text), { extra: { allowedMentions: NO_PING } });

function help(ctx) {
    const c = ui.box('base').addTextDisplayComponents(
        ui.text('### Birthdays'),
        ui.text('`birthday set 14 mar` or `birthday set 14 mar 2005`\n`birthday view [user]` · `birthday remove` · `birthday upcoming`'),
        ui.text('-# Admins: `birthday enable [#channel]` · `disable` · `channel` · `message` · `ping` · `timezone` · `test` · `settings`'),
    );
    return ui.send(ctx, c, { extra: { allowedMentions: NO_PING } });
}

module.exports = {
    data, name: 'birthday', description: 'Save your birthday and get wished in servers that turn it on',
    aliases: ['bday', 'bd'], category: 'utility', dm: true,

    async execute(ctx, args = []) {
        const slash = !!ctx.isChatInputCommand?.();
        const actor = ctx.user ?? ctx.author;
        let sub = slash ? ctx.options.getSubcommand() : String(args[0] ?? '').toLowerCase();
        let rest = slash ? [] : args.slice(1);

        if (!slash) {
            if (!sub) return help(ctx);
            if (!SUBS.includes(sub)) {                       // `birthday @user` or `birthday 14 mar`
                const mention = ctx.mentions?.users?.first();
                if (mention) { sub = 'view'; rest = []; }
                else if (B.parseDate(args.join(' ')).month) { sub = 'set'; rest = args; }
                else return help(ctx);
            }
        }

        if (ADMIN.has(sub)) {
            if (!ctx.guild) return ui.say.error(ctx, 'Use this in a server');
            if (!ctx.member?.permissions?.has(P.ManageGuild)) return ui.say.error(ctx, 'You need **Manage Server** for that');
        }

        switch (sub) {
            case 'set': {
                const parsed = B.parseDate(slash ? ctx.options.getString('date') : rest.join(' '));
                if (parsed.error) return ui.say.error(ctx, parsed.error);
                await db.setUser(actor.id, parsed.month, parsed.day, parsed.year);
                const row = { month: parsed.month, day: parsed.day, year: parsed.year };
                const n = B.nextOne(row);
                return say(ctx, `${icon('birthday') ? icon('birthday') + ' ' : ''}Saved: **${B.pretty(row)}**${parsed.year ? ` (${parsed.year})` : ''}. ${n.days === 0 ? 'That\'s today!' : `${n.days} day${n.days === 1 ? '' : 's'} to go.`}\n-# Servers with birthdays turned on will wish you. Change it any time with \`birthday set\`.`, 'success');
            }
            case 'remove': {
                const had = await db.getUser(actor.id);
                if (!had) return say(ctx, 'You haven\'t saved a birthday', 'warning');
                await db.removeUser(actor.id);
                return say(ctx, 'Your birthday is removed', 'success');
            }
            case 'view': {
                const target = slash ? (ctx.options.getUser('user') ?? actor) : (ctx.mentions?.users?.first() ?? actor);
                const row = await db.getUser(target.id);
                if (!row) return say(ctx, target.id === actor.id ? 'You haven\'t saved a birthday. Use `birthday set 14 mar`' : `${target.username} hasn't saved a birthday`, 'warning');
                const n = B.nextOne(row);
                return say(ctx, `**${target.username}** · ${B.pretty(row)}${row.year ? ` · turns ${n.turns}` : ''}\n-# ${n.days === 0 ? 'today!' : `in ${n.days} day${n.days === 1 ? '' : 's'}`}`);
            }
            case 'upcoming': {
                if (!ctx.guild) return ui.say.error(ctx, 'Use this in a server');
                const rows = (await db.all()).map((r) => ({ r, n: B.nextOne(r) })).sort((a, b) => a.n.days - b.n.days);
                const out = [];
                let checked = 0;
                for (const { r, n } of rows) {
                    if (out.length >= 10 || checked >= 80) break;
                    checked++;
                    const m = ctx.guild.members.cache.get(r.user_id) ?? await ctx.guild.members.fetch(r.user_id).catch(() => null);
                    if (m) out.push(`${n.days === 0 ? '**today**' : `in ${n.days}d`} · ${m} · ${B.pretty(r)}`);
                }
                if (!out.length) return say(ctx, 'Nobody here has saved a birthday yet. Use `birthday set 14 mar`', 'warning');
                const c = ui.box('base').addTextDisplayComponents(ui.text('### Upcoming birthdays'), ui.text(out.join('\n')));
                return ui.send(ctx, c, { extra: { allowedMentions: NO_PING } });
            }
            case 'enable': {
                const ch = (slash ? ctx.options.getChannel('channel') : ctx.mentions?.channels?.first()) ?? ctx.channel;
                if (!ch?.isTextBased?.() || !TEXT_TYPES.includes(ch.type)) return ui.say.error(ctx, 'Pick a text channel');
                const perms = ch.permissionsFor(ctx.guild.members.me);
                if (!perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) return ui.say.error(ctx, `I need View Channel, Send Messages and Embed Links in ${ch}`);
                await db.setGuild(ctx.guild.id, { enabled: true, channel_id: ch.id });
                return say(ctx, `Birthday wishes are on in ${ch}\n-# Members add theirs with \`birthday set 14 mar\`. Change the text with \`birthday message\`.`, 'success');
            }
            case 'disable':
                await db.setGuild(ctx.guild.id, { enabled: false });
                return say(ctx, 'Birthday wishes are off', 'success');
            case 'channel': {
                const ch = (slash ? ctx.options.getChannel('channel') : ctx.mentions?.channels?.first());
                if (!ch || !TEXT_TYPES.includes(ch.type)) return ui.say.error(ctx, 'Mention a text channel, like `birthday channel #birthdays`');
                if (!ch.permissionsFor(ctx.guild.members.me)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) return ui.say.error(ctx, `I need View Channel, Send Messages and Embed Links in ${ch}`);
                await db.setGuild(ctx.guild.id, { channel_id: ch.id });
                return say(ctx, `Wishes will go to ${ch}`, 'success');
            }
            case 'message': {
                const text = (slash ? ctx.options.getString('text') : rest.join(' ')).trim();
                if (!text) return ui.say.error(ctx, 'Give me the text, or `reset`. Variables: `{user}` `{name}` `{age}` `{server}`');
                await db.setGuild(ctx.guild.id, { message: text.toLowerCase() === 'reset' ? null : text.slice(0, 500) });
                return say(ctx, text.toLowerCase() === 'reset' ? 'Back to the default wish' : 'Wish text saved. Try it with `birthday test`', 'success');
            }
            case 'ping': {
                const v = slash ? ctx.options.getBoolean('enabled') : ['on', 'yes', 'true', 'enable'].includes(String(rest[0]).toLowerCase()) ? true : ['off', 'no', 'false', 'disable'].includes(String(rest[0]).toLowerCase()) ? false : null;
                if (v === null) return ui.say.error(ctx, 'Say `birthday ping on` or `birthday ping off`');
                await db.setGuild(ctx.guild.id, { ping: v });
                return say(ctx, v ? 'I will ping the birthday member' : 'I won\'t ping them', 'success');
            }
            case 'timezone': {
                const mins = B.parseOffset(slash ? ctx.options.getString('offset') : rest.join(' '));
                if (mins === null) return ui.say.error(ctx, 'Use an offset like `+5:30`, `-8` or `UTC`');
                await db.setGuild(ctx.guild.id, { tz: mins });
                return say(ctx, `Birthdays in this server follow **${B.offsetLabel(mins)}**`, 'success');
            }
            case 'test': {
                const cfg = await db.guild(ctx.guild.id);
                const row = (await db.getUser(actor.id)) ?? { month: 1, day: 1, year: null };
                const member = ctx.member ?? await ctx.guild.members.fetch(actor.id).catch(() => null);
                const embed = B.announcement({ user: actor, member, guild: ctx.guild, row, cfg, today: B.localToday(cfg.tz) });
                return ui.sendEmbed(ctx, embed, { extra: { allowedMentions: NO_PING } });
            }
            case 'settings': {
                const cfg = await db.guild(ctx.guild.id);
                const c = ui.box('base').addTextDisplayComponents(
                    ui.text('### Birthday settings'),
                    ui.text([
                        `**Status** ${cfg.enabled ? 'on' : 'off'}`,
                        `**Channel** ${cfg.channel_id ? `<#${cfg.channel_id}>` : 'not set. Use `birthday enable`'}`,
                        `**Ping** ${cfg.ping ? 'yes' : 'no'}`,
                        `**Time zone** ${B.offsetLabel(cfg.tz)}`,
                        `**Text** ${cfg.message ? `\n> ${cfg.message}` : 'default'}`,
                    ].join('\n')),
                );
                return ui.send(ctx, c, { extra: { allowedMentions: NO_PING } });
            }
            default: return help(ctx);
        }
    },
};
