// grace · antiraid, lockdown and permission guard events.

const { Events } = require('discord.js');
const raid = require('../../services/antiraid');
const lockdown = require('../../services/lockdown');
const guard = require('../../services/permGuard');

const safe = (tag, fn) => (...a) => Promise.resolve(fn(...a)).catch((e) => console.error(`[security] ${tag}:`, e.message));

module.exports = {
  name: 'securityEvents',

  async init(client) {
    client.on(Events.GuildMemberAdd, safe('antiraid', raid.onJoin));
    client.on(Events.ChannelCreate, safe('lockdown', lockdown.protectNew));

    client.on(Events.GuildRoleUpdate, safe('role update', guard.onRoleUpdate));
    client.on(Events.GuildRoleCreate, safe('role create', guard.onRoleCreate));
    client.on(Events.GuildMemberUpdate, safe('member update', guard.onMemberUpdate));
    client.on(Events.ChannelDelete, safe('channel recovery', guard.onChannelDelete));
    client.on(Events.GuildRoleDelete, safe('role recovery', guard.onRoleDelete));

    const tick = () => {
      lockdown.expire(client).catch((e) => console.error('[lockdown] expiry:', e.message));
      raid.expire(client).catch((e) => console.error('[antiraid] expiry:', e.message));
    };
    client.once(Events.ClientReady, () => {
      guard.baselineAll(client).catch(() => {});
      tick();
      setInterval(tick, 30_000).unref?.();
    });
  },
};
