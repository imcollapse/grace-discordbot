// grace · birthday announcements. Every few minutes: for each server that turned birthdays on, find members whose
// birthday is today (in the server's time zone) and post the embed once.

const db = require('../database/birthdays');
const B = require('../services/birthday');

const EVERY = 5 * 60 * 1000;
let running = false;

async function sweep(client) {
    if (running) return;
    running = true;
    try {
        const guilds = await db.enabledGuilds();
        for (const cfg of guilds) try {
            const guild = client.guilds.cache.get(cfg.guild_id);
            if (!guild) continue;
            const today = B.localToday(cfg.tz);
            const channel = guild.channels.cache.get(cfg.channel_id) ?? await guild.channels.fetch(cfg.channel_id).catch(() => null);
            if (!channel?.isTextBased?.() || !channel.permissionsFor(guild.members.me)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) continue;

            const rows = [...await db.onDay(today.month, today.day), ...(today.month === 2 && today.day === 28 && !(today.year % 4 === 0 && (today.year % 100 !== 0 || today.year % 400 === 0)) ? await db.onDay(2, 29) : [])];
            const embeds = [], pings = [], done = [];
            for (const row of rows) {
                if (await db.wasSent(guild.id, row.user_id, today.year)) continue;
                const member = await guild.members.fetch(row.user_id).catch(() => null);
                if (!member || member.user.bot) continue;
                embeds.push(B.announcement({ user: member.user, member, guild, row, cfg, today }));
                pings.push(member.id); done.push(row.user_id);
            }
            if (!embeds.length) continue;
            for (let i = 0; i < embeds.length; i += 10) {
                const ids = pings.slice(i, i + 10);
                await channel.send({
                    content: cfg.ping ? ids.map((id) => `<@${id}>`).join(' ') : undefined,
                    embeds: embeds.slice(i, i + 10),
                    allowedMentions: cfg.ping ? { users: ids } : { parse: [] },
                }).catch((e) => console.error('[birthday] send failed:', e.message));
            }
            for (const id of done) await db.markSent(guild.id, id, today.year);
        } catch (e) { console.error('[birthday] guild', cfg.guild_id, e.message); }
        await db.prune(new Date().getUTCFullYear());
    } catch (e) { console.error('[birthday] sweep:', e.message); }
    finally { running = false; }
}

function init(client) {
    client.once('clientReady', () => { setTimeout(() => sweep(client), 20000); setInterval(() => sweep(client), EVERY); });
    if (client.isReady?.()) { setTimeout(() => sweep(client), 20000); setInterval(() => sweep(client), EVERY); }
}

module.exports = { init, sweep };
