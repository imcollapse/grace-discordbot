// grace · levels: XP for messages and voice time, and giving reward roles back to members who return.

const { Events } = require('discord.js');
const L = require('../services/levels');
const db = require('../database/levels');

module.exports = {
    init(client) {
        client.on(Events.MessageCreate, (message) => {
            if (!message.guild || message.author.bot || message.webhookId) return;
            L.awardMessage(message).catch((e) => console.error('[levels] message:', e.message));
        });

        // voice time: once a minute
        setInterval(() => L.voiceSweep(client).catch((e) => console.error('[levels] voice:', e.message)), 60000).unref?.();

        // somebody comes back: they get the roles their level earned
        client.on(Events.GuildMemberAdd, async (member) => {
            if (member.user.bot) return;
            try {
                const s = await L.settings(member.guild.id);
                if (!s.cfg.enabled || !s.rewards.length) return;
                const row = await db.getUser(member.guild.id, member.id);
                if (row && Number(row.level) > 0) await L.syncRoles(member, Number(row.level), s);
            } catch (e) { console.error('[levels] rejoin:', e.message); }
        });
    },
};
