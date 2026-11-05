// grace · verification + join DM events.
//   join    Unverified role + captcha ping, then the join DM
//   leave   forget a pending member
//   new channels are hidden from Unverified right away; a timer kicks members who never verify

const { Events } = require('discord.js');
const V = require('../services/verify');
const D = require('../services/joinDm');

module.exports = {
  name: 'verifyEvents',

  async init(client) {
    client.on(Events.GuildMemberAdd, async (member) => {
      await V.onJoin(member).catch((e) => console.error('[verify] join:', e.message));
      await D.onJoin(member).catch((e) => console.error('[joindm] join:', e.message));
    });
    client.on(Events.GuildMemberRemove, (member) => V.onLeave(member));
    client.on(Events.ChannelCreate, (channel) => V.protectChannel(channel).catch(() => {}));

    const tick = () => V.expire(client).catch((e) => console.error('[verify] expiry:', e.message));
    client.once(Events.ClientReady, () => { tick(); setInterval(tick, 60_000).unref?.(); });
  },
};
