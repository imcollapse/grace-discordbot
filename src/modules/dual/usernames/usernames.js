// grace · ,usernames  ·  /usernames
//   <name>   what the bot can tell about a username        (captcha first)
//   list     released usernames the bot has seen
// Discord does not let bots check whether a username is free, so this reports what can be known.

const K = require('../../../services/lookupKit');
const gate = require('../../../services/lookupGate');
const panel = require('../../../services/lookupPanel');
const db = require('../../../database/lookup');
const { makeCommand, need } = require('../../../services/socialKit');

const { kv, group, code, card, send, ui } = K;
const RESERVED = new Set(['everyone', 'here', 'discord', 'system', 'clyde']);
const gated = (fn) => async (ctx, arg) => ((await gate.ensure(ctx)) ? fn(ctx, arg) : undefined);

function problems(n) {
  const out = [];
  if (n.length < 2 || n.length > 32) out.push('Must be 2 to 32 characters.');
  if (/[^a-z0-9_.]/.test(n)) out.push('Only lowercase letters, numbers, underscores and periods are allowed.');
  if (/\.\./.test(n)) out.push('Two periods in a row are not allowed.');
  if (RESERVED.has(n)) out.push('That word is reserved by Discord.');
  return out;
}

async function check(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which username', 'usernames <name>');
  const n = arg.trim().replace(/^@/, '').toLowerCase();
  const bad = problems(n);
  const inUse = !bad.length && ctx.client.users.cache.some(u => u.username === n && !u.bot);
  const seen = !bad.length ? await db.dropped('username', n).catch(() => null) : null;

  let verdict;
  if (bad.length) verdict = group('Not valid', bad);
  else if (inUse) verdict = group('In use', ['The bot can see someone using this username right now.']);
  else if (seen) verdict = group('Released', [`Seen released ${K.ago(seen.dropped_at)}.`, 'Someone may already have taken it again. Try it in your Discord settings.']);
  else verdict = group('Unknown', ['The bot has not seen anyone use or release this name.', 'Discord does not let bots check availability. Try it in Settings, My Account, Username.']);

  return send(ctx, card({
    title: 'Username Check', iconKey: 'lookup_user', about: `Results for ${code(n)}`,
    groups: [verdict, bad.length ? null : group('Format', [kv('Length', `${n.length} characters`), kv('Characters', /^[0-9]+$/.test(n) ? 'numbers only' : /^[a-z]+$/.test(n) ? 'letters only' : 'letters, numbers or symbols')])],
    footer: 'Based on what this bot has seen',
  }));
}

async function list(ctx) { return (await gate.ensure(ctx)) ? panel.open(ctx, 'username') : undefined; }

module.exports = makeCommand({
  name: 'usernames', aliases: ['username', 'un'],
  description: 'Check a username and browse released usernames',
  category: 'utility', fallback: 'check', bare: 'list', help: 'usernames',
  usage: 'usernames <name|list>',
  subs: [
    { name: 'check', aliases: ['c'], desc: 'Check what is known about a username', arg: 'name', argDesc: 'The username', run: gated(check) },
    { name: 'list', aliases: ['dropped'], desc: 'Browse released usernames', run: list },
  ],
});
