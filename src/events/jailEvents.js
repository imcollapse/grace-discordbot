// grace — jail: keep jailed people jailed (rejoin), protect new channels, release when time is up.

const { Events } = require('discord.js');
const J = require('../services/jail');

module.exports = {
    name: 'jailEvents',

    async init(client) {
        client.on(Events.GuildMemberAdd, (member) => J.reapply(member).catch((e) => console.error('[jail] rejoin:', e.message)));
        client.on(Events.ChannelCreate, (channel) => J.protectChannel(channel).catch(() => {}));

        const tick = () => J.expire(client).catch((e) => console.error('[jail] expiry:', e.message));
        client.once(Events.ClientReady, () => { tick(); setInterval(tick, 30000).unref?.(); });
    },
};
