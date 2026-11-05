/**
 * ┌ cosmin
 * └ services/presence.js
 */

// grace — rotating presence (streaming only, mobile icon).
//
// Edit `STATUS.activities` in src/settings/index.js. Tokens:
//   {prefix} {servers} {users} {commands} {name}

const { ActivityType } = require('discord.js');
const SF = require('./statsFormat');
const config = require('../settings');

const FALLBACK = [{ text: '{prefix}help' }, { text: 'over {servers} servers' }];

function fill(template, client) {
  const users = client.guilds.cache.reduce((n, g) => n + (g.memberCount || 0), 0);
  return String(template)
    .replace(/\{prefix\}/g, config.PREFIX)
    .replace(/\{servers\}/g, SF.compact(client.guilds.cache.size))
    .replace(/\{users\}/g, SF.compact(users))
    .replace(/\{commands\}/g, SF.commandLabel(SF.commandTotal(client)))
    .replace(/\{name\}/g, client.user.username)
    .slice(0, 128);
}

/** Always a streaming activity (needs a stream link to show the purple status). */
function build(entry, client, url) {
  return { type: ActivityType.Streaming, name: fill(entry.text, client), url };
}

function startPresence(client) {
  const cfg = config.STATUS || {};
  const list = Array.isArray(cfg.activities) && cfg.activities.length ? cfg.activities : FALLBACK;
  const every = Math.max(15, Number(cfg.rotateSeconds) || 30) * 1000;
  let i = 0;

  const tick = () => {
    try {
      client.user.setPresence({
        status: cfg.status || 'online',
        activities: [build(list[i % list.length], client, cfg.streamUrl || 'https://www.twitch.tv/discord')],
      });
      i++;
    } catch (_) { /* gateway not ready — next tick */ }
  };

  tick();
  return setInterval(tick, every);
}

module.exports = { startPresence, fill };
