// grace · ,vanity  ·  /vanity
//   <code>            is a vanity invite code in use?     (captcha first)
//   list              released vanity codes the bot has seen
//   watch <code>      DM me when it frees up              unwatch <code> · watching

const { MessageFlags } = require('discord.js');
const nt = require('../../../services/netTools');
const K = require('../../../services/lookupKit');
const gate = require('../../../services/lookupGate');
const panel = require('../../../services/lookupPanel');
const vt = require('../../../services/vanityTools');
const db = require('../../../database/lookup');
const { makeCommand, need } = require('../../../services/socialKit');

const { kv, group, code, when, num, card, note, send, ui } = K;
const MAX_WATCH = 10;
const gated = (fn) => async (ctx, arg) => ((await gate.ensure(ctx)) ? fn(ctx, arg) : undefined);

async function check(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which vanity code', 'vanity <code>');
  const c = vt.clean(arg);
  const r = await vt.check(c);
  const seen = await db.dropped('vanity', c).catch(() => null);
  const mine = ctx.client.guilds.cache.find(g => g.vanityURLCode?.toLowerCase() === c);

  if (r.state === 'free') {
    return send(ctx, card({
      title: 'Vanity Check', iconKey: 'lookup_vanity', about: `Results for ${code(`discord.gg/${c}`)}`,
      groups: [group('Not in use', ['No server is using this code right now.', seen ? `Seen released ${K.ago(seen.dropped_at)}.` : null, 'Servers need level 3 boosts, or to be Partnered or Verified, to claim a vanity.'])],
      footer: 'Discord invite lookup',
    }));
  }
  const taken = r.state === 'taken';
  const rows = [ui.row(K.ui.link('Open invite', `https://discord.gg/${c}`), ...(taken ? [ui.btn(`lkv_watch_${c}`, 'Notify me if it frees up', { emoji: K.icon('lookup_watch', '') || undefined })] : []))];
  const msg = await send(ctx, card({
    title: 'Vanity Check', iconKey: 'lookup_vanity', about: `Results for ${code(`discord.gg/${c}`)}`, thumb: r.guild.icon,
    groups: [
      group(taken ? 'In use' : 'Not a vanity', [taken ? null : 'This code belongs to a regular invite. The vanity itself may still be free once that invite expires.',
        kv('Server', r.guild.name), kv('Members', r.members !== null && num(r.members)), kv('Online', r.online !== null && num(r.online)), kv('Server ID', r.guild.id)]),
      mine ? `${ui.sub('This server is one the bot is in.')}` : null,
    ],
    footer: 'Discord invite lookup', rows,
  }));
  if (taken && msg?.createMessageComponentCollector) {
    const me = K.userOf(ctx);
    const col = msg.createMessageComponentCollector({ filter: ui.onlyUser(me.id), time: 120000, max: 1 });
    col.on('collect', async (i) => {
      try {
        if (await db.watchCount(me.id) >= MAX_WATCH) return i.reply({ components: [ui.warn(`You can watch up to ${MAX_WATCH} codes. Remove one with \`vanity unwatch\`.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        await db.watchAdd(me.id, c);
        return i.reply({ components: [ui.success(`Watching \`${c}\`. I will send you a DM when it frees up.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      } catch (e) { console.error('[vanity]', e.message); }
    });
  }
  return msg;
}

async function list(ctx) { return (await gate.ensure(ctx)) ? panel.open(ctx, 'vanity') : undefined; }

async function watch(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which vanity code', 'vanity watch <code>');
  const c = vt.clean(arg), me = K.userOf(ctx);
  if (await db.watchCount(me.id) >= MAX_WATCH) return send(ctx, note('warning', `You can watch up to ${MAX_WATCH} codes.`, 'vanity unwatch <code>'));
  const r = await vt.check(c);
  if (r.state === 'free') return send(ctx, note('info', `\`${c}\` is not used by any server right now.`));
  await db.watchAdd(me.id, c);
  return send(ctx, note('success', `Watching \`${c}\`. I will send you a DM when it frees up.`, 'Make sure your DMs are open'));
}

async function unwatch(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which vanity code', 'vanity unwatch <code>');
  await db.watchRemove(K.userOf(ctx).id, vt.clean(arg));
  return send(ctx, note('success', 'Removed.'));
}

async function watching(ctx) {
  const rows = await db.watchOf(K.userOf(ctx).id);
  if (!rows.length) return send(ctx, note('info', 'You are not watching any codes.', 'vanity watch <code>'));
  return send(ctx, card({ title: 'Watching', iconKey: 'lookup_watch', groups: [rows.map(r => `${code(r.code)}  ·  since ${K.ago(r.created_at)}`).join('\n')], footer: `${rows.length}/${MAX_WATCH} codes` }));
}

module.exports = makeCommand({
  name: 'vanity', aliases: ['vanities'],
  description: 'Check vanity invite codes and get told when one frees up',
  category: 'utility', fallback: 'check', bare: 'list', help: 'vanity',
  usage: 'vanity <code|list|watch|unwatch|watching>',
  subs: [
    { name: 'check', aliases: ['c'], desc: 'Check if a vanity code is in use', arg: 'code', argDesc: 'The code, e.g. grace', run: gated(check) },
    { name: 'list', aliases: ['dropped'], desc: 'Browse released vanity codes', run: list },
    { name: 'watch', desc: 'Get a DM when a vanity code frees up', arg: 'code', argDesc: 'The code to watch', run: watch },
    { name: 'unwatch', desc: 'Stop watching a vanity code', arg: 'code', argDesc: 'The code', run: unwatch },
    { name: 'watching', aliases: ['watchlist'], desc: 'Your watched vanity codes', run: watching },
  ],
});
