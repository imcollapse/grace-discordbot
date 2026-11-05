// Premium — every few minutes, tell server owners whose premium (or trial) has run out.

const { Events, MessageFlags } = require('discord.js');
const P = require('../services/premium');
const V = require('../services/premium/views');

const EVERY = 5 * 60 * 1000;

async function sweep(client) {
    let due = [];
    try { due = await P.dueNotices(); } catch (err) { return console.error('[premium] sweep:', err.message); }

    for (const row of due) {
        try {
            const guild = client.guilds.cache.get(row.guildId) ?? { id: row.guildId, name: row.guildName || 'your server', iconURL: () => null };
            const payload = { components: [V.ended(guild, { source: row.source })], flags: MessageFlags.IsComponentsV2 };

            let sent = false;
            const owner = await client.users.fetch(row.ownerId).catch(() => null);
            if (owner) sent = await owner.send(payload).then(() => true).catch(() => false);
            if (!sent && guild.systemChannel?.permissionsFor?.(guild.members.me)?.has('SendMessages')) {
                sent = await guild.systemChannel.send({ ...payload, content: undefined }).then(() => true).catch(() => false);
            }
            await P.markNotified(row.guildId);   // mark even when the DM failed so it is never retried forever
            P.bust(row.guildId);
        } catch (err) { console.error('[premium] notice failed:', err.message); }
    }
}

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        sweep(client);
        setInterval(() => sweep(client), EVERY).unref?.();
    },
};
