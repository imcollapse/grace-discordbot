// grace · records names the bot sees being released, for the lookup panel.
//   - a member changes their username  → the old username is released
//   - a server changes or loses its vanity code → the old code is released
// Both are only what this bot can see, and a name may already be taken again.

const { Events } = require('discord.js');

module.exports = {
  name: 'lookupEvents',
  init(client) {
    const db = require('../database/lookup');
    const vanity = require('../services/vanityTools');

    client.on(Events.UserUpdate, async (oldUser, newUser) => {
      try {
        if (!oldUser?.username || !newUser?.username || oldUser.bot || oldUser.username === newUser.username) return;
        await db.drop('username', oldUser.username, 'rename');
        await db.take('username', newUser.username);     // someone just claimed this one
      } catch (e) { console.error('[lookup] rename', e.message); }
    });

    client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
      try {
        const was = oldGuild.vanityURLCode, now = newGuild.vanityURLCode;
        if (was === now) return;
        if (was) await db.drop('vanity', was, 'change');
        if (now) await db.take('vanity', now);
      } catch (e) { console.error('[lookup] vanity', e.message); }
    });

    vanity.startWatcher(client);
  },
};
