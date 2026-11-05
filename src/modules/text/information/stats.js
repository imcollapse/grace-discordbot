// grace · ,stats — server and member analytics.
// Three dropdowns: Lookback (how far back), View (which card) and a member picker for User Analytics.

const {
    AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, UserSelectMenuBuilder,
} = require('discord.js');
const serverStats = require('../../../database/serverStats');
const C = require('../../../services/statsChart');
const { hiddenChannelIds } = require('../../../services/statsScope');
const { icon } = require('../../../services/icons');

const LOOKBACKS = {
    1:  { label: 'Last 24 hours', description: 'Today and yesterday' },
    7:  { label: 'Last 7 days',   description: 'The past week' },
    14: { label: 'Last 14 days',  description: 'The past two weeks' },
    30: { label: 'Last 30 days',  description: 'The past month' },
};
const VIEWS = {
    overview:   { label: 'Server overview',   description: 'The whole server at a glance',        emoji: icon('stats_overview', '🗂️'),   build: buildOverview },
    activity:   { label: 'Activity',          description: 'Messages, voice and reactions per day', emoji: icon('stats_activity', '📈'),   build: buildActivity },
    messages:   { label: 'Messages',          description: 'Top members and channels',             emoji: icon('stats_messages', '💬'),   build: buildMessages },
    voice:      { label: 'Voice activity',    description: 'Voice time and who spends it',         emoji: icon('stats_voice', '🎙️'),      build: buildVoice },
    membership: { label: 'Membership',        description: 'Joins, leaves and growth',             emoji: icon('stats_membership', '👥'), build: buildMembership },
    user:       { label: 'User analytics',    description: 'Pick a member to open their stats',    emoji: icon('stats_user', '👤'),       build: buildUser },
};

const dayOf = (d) => Math.max(Number(d) || 30, 1);
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const ago = (ms) => {
    const d = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
    return d >= 365 ? `${(d / 365).toFixed(1)}y` : `${d}d`;
};

async function memberName(guild, userId) {
    const m = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
    return m?.displayName ?? (await guild.client.users.fetch(userId).catch(() => null))?.username ?? 'Unknown member';
}
const channelName = (guild, id) => { const c = guild.channels.cache.get(id); return c ? `#${c.name}` : '#deleted-channel'; };

/** Fields every card shares. */
function base(guild, client, st) {
    const days = dayOf(st.days);
    return {
        botName: client.user.username,
        botAvatarURL: client.user.displayAvatarURL({ extension: 'png', size: 64 }),
        guildName: guild.name,
        guildIconURL: guild.iconURL({ extension: 'png', size: 128 }) || null,
        memberCount: guild.memberCount,
        createdAt: shortDate(guild.createdAt),
        days,
        rangeLabel: LOOKBACKS[days].label,
        note: days === 1 ? 'daily buckets' : '',
    };
}

const chartDays = (days) => Math.max(days, 7);

async function topChannels(guild, hidden, days, limit = 5) {
    const rows = (await serverStats.getTopChannels(guild.id, days, 25, hidden)).filter(r => guild.channels.cache.has(r.channelId)).slice(0, limit);
    return rows.map(r => ({ name: channelName(guild, r.channelId), value: C.formatNumber(Number(r.total)), raw: Number(r.total) }));
}
async function topMembers(guild, hidden, days, limit = 5) {
    const rows = await serverStats.getTopMembers(guild.id, days, limit, hidden);
    return Promise.all(rows.map(async r => ({ name: await memberName(guild, r.userId), value: C.formatNumber(Number(r.total)), raw: Number(r.total) })));
}
const totalsFor = async (guild, days, hidden) => {
    const [messages, reactions, voiceSeconds, ml] = await Promise.all([
        serverStats.getMessageSum(guild.id, days, hidden),
        serverStats.getReactionSum(guild.id, days),
        serverStats.getVoiceSecondsSum(guild.id, days),
        serverStats.getJoinsLeavesSum(guild.id, days),
    ]);
    return { messages, reactions, voiceSeconds, joins: ml.joins, leaves: ml.leaves };
};
const inVoiceNow = (guild) => guild.voiceStates?.cache?.filter(v => v.channelId && !v.member?.user?.bot).size ?? 0;

/* ---------- views ---------- */

async function buildOverview(guild, client, st) {
    const o = base(guild, client, st), hidden = hiddenChannelIds(guild);
    const [totals, series, channels, members] = await Promise.all([
        totalsFor(guild, o.days, hidden), serverStats.getDailySeries(guild.id, chartDays(o.days), hidden),
        topChannels(guild, hidden, o.days), topMembers(guild, hidden, o.days),
    ]);
    return C.renderOverviewCard({ ...o, totals, series, topChannels: channels, topMembers: members });
}
async function buildActivity(guild, client, st) {
    const o = base(guild, client, st), hidden = hiddenChannelIds(guild);
    return C.renderActivityCard({ ...o, series: await serverStats.getDailySeries(guild.id, chartDays(o.days), hidden) });
}
async function buildMembership(guild, client, st) {
    const o = base(guild, client, st);
    return C.renderMembershipCard({ ...o, series: await serverStats.getDailySeries(guild.id, chartDays(o.days)) });
}
async function buildMessages(guild, client, st) {
    const o = base(guild, client, st), hidden = hiddenChannelIds(guild);
    const [totals, series, channels, members, all] = await Promise.all([
        totalsFor(guild, o.days, hidden), serverStats.getDailySeries(guild.id, chartDays(o.days), hidden),
        topChannels(guild, hidden, o.days), topMembers(guild, hidden, o.days),
        serverStats.getTopMembers(guild.id, o.days, 1000, hidden),
    ]);
    return C.renderMessagesCard({ ...o, totals, series, topChannels: channels, topMembers: members, chatters: all.length });
}
async function buildVoice(guild, client, st) {
    const o = base(guild, client, st), hidden = hiddenChannelIds(guild);
    const [totals, series, voiceMembers, rows] = await Promise.all([
        totalsFor(guild, o.days, hidden), serverStats.getDailySeries(guild.id, chartDays(o.days), hidden),
        serverStats.getVoiceMemberCount(guild.id, o.days), serverStats.getTopVoiceMembers(guild.id, o.days, 5),
    ]);
    const topVoice = await Promise.all(rows.map(async r => ({ name: await memberName(guild, r.userId), value: C.formatDuration(Number(r.total)), raw: Number(r.total) })));
    return C.renderVoiceCard({ ...o, totals, series, voiceMembers, topVoice, inVoice: inVoiceNow(guild) });
}
async function buildUser(guild, client, st) {
    const o = base(guild, client, st), hidden = hiddenChannelIds(guild);
    const userId = st.userId;
    const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
    const user = member?.user ?? await client.users.fetch(userId).catch(() => null);
    const days = chartDays(o.days);
    const [u, guildMsgs, guildVoice] = await Promise.all([
        serverStats.getUserStats(guild.id, userId, o.days, hidden),
        serverStats.getMessageSum(guild.id, o.days, hidden), serverStats.getVoiceSecondsSum(guild.id, o.days),
    ]);
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
        const key = serverStats.daysAgoKey(i);
        series.push({ date: key, messages: u.dayMessages.get(key) || 0, voiceSeconds: u.dayVoice.get(key) || 0 });
    }
    const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '0%');
    return C.renderUserCard({
        ...o,
        id: userId,
        name: member?.displayName ?? user?.username ?? 'Unknown member',
        avatarUrl: (member ?? user)?.displayAvatarURL?.({ extension: 'png', size: 128 }) ?? null,
        roles: member ? Math.max(0, member.roles.cache.size - 1) : 0,
        messages: u.messages, voiceSeconds: u.voiceSeconds, messageRank: u.messageRank, voiceRank: u.voiceRank, activeDays: u.activeDays,
        series,
        topChannels: u.channels.slice(0, 5).filter(c => guild.channels.cache.has(c.channelId)).map(c => ({ name: channelName(guild, c.channelId), value: C.formatNumber(c.total), raw: c.total })),
        snapshot: [
            { label: 'Message share', value: pct(u.messages, guildMsgs) },
            { label: 'Voice share', value: pct(u.voiceSeconds, guildVoice) },
            { label: 'Avg voice a day', value: C.formatDuration(u.voiceSeconds / o.days) },
            { label: 'In server', value: member?.joinedTimestamp ? ago(member.joinedTimestamp) : '—' },
            { label: 'Account age', value: user ? ago(user.createdTimestamp) : '—' },
            { label: 'In voice now', value: member?.voice?.channelId ? 'Yes' : 'No' },
        ],
    });
}

/* ---------- components ---------- */

function rows(st, disabled = false) {
    const lookback = new StringSelectMenuBuilder().setCustomId('stats_lookback').setPlaceholder('Lookback').setDisabled(disabled)
        .addOptions(Object.entries(LOOKBACKS).map(([d, v]) => ({
            label: v.label, description: v.description, value: d, default: Number(d) === st.days, emoji: icon('stats_lookback', '🕒'),
        })));
    const view = new StringSelectMenuBuilder().setCustomId('stats_view').setPlaceholder('View').setDisabled(disabled)
        .addOptions(Object.entries(VIEWS).map(([k, v]) => ({ label: v.label, description: v.description, value: k, default: k === st.view, emoji: v.emoji })));
    const user = new UserSelectMenuBuilder().setCustomId('stats_user').setPlaceholder('Pick a member for User analytics…').setDisabled(disabled)
        .setDefaultUsers(st.userId ? [st.userId] : []);
    const refresh = new ButtonBuilder().setCustomId('stats_refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary).setDisabled(disabled);
    // the member picker only shows on the User analytics view
    const picks = st.view === 'user' ? [lookback, view, user] : [lookback, view];
    return picks.map(c => new ActionRowBuilder().addComponents(c)).concat(new ActionRowBuilder().addComponents(refresh));
}

async function payload(guild, client, st) {
    const buffer = await VIEWS[st.view].build(guild, client, st);
    return { content: '', files: [new AttachmentBuilder(buffer, { name: 'stats.png' })], attachments: [], components: rows(st) };
}

module.exports = {
    name: 'stats',
    description: "Shows the server's statistics",
    aliases: ['serverstats', 'statistics'],

    async execute(message) {
        if (!message.guild) return message.reply('This command can only be used in a server.');

        const st = { view: 'overview', days: 30, userId: message.author.id };
        let first;
        try { first = await payload(message.guild, message.client, st); }
        catch (e) { console.error('[stats]', e); return message.reply('Could not draw the stats card. Try again in a moment.'); }
        const { attachments, ...firstSend } = first;
        const sent = await message.reply(firstSend);

        const collector = sent.createMessageComponentCollector({ time: 5 * 60 * 1000 });
        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) return i.reply({ content: "This isn't your stats view.", ephemeral: true }).catch(() => {});
            if (i.customId === 'stats_lookback') st.days = dayOf(i.values[0]);
            else if (i.customId === 'stats_view') st.view = VIEWS[i.values[0]] ? i.values[0] : st.view;
            else if (i.customId === 'stats_user') { st.userId = i.values[0]; st.view = 'user'; }
            else if (i.customId !== 'stats_refresh') return;
            await i.deferUpdate().catch(() => {});
            try { await i.editReply(await payload(message.guild, message.client, st)); }
            catch (e) { console.error('[stats]', e); await i.followUp({ content: 'Could not draw that card. Try again.', ephemeral: true }).catch(() => {}); }
        });
        collector.on('end', () => { sent.edit({ components: rows(st, true) }).catch(() => {}); });
    },
};
