// grace · a small paged container. render(at) returns a ContainerBuilder without the navigation row.
//   total      number of pages, or a function returning it (when pages load later)
//   extra      (at) => extra buttons (link buttons work)
//   handle     async (interaction, at) => true when it dealt with an extra button
//   loadMore   async () => true if more pages were added (called when ▶ is pressed on the last page)

const ui = require('./ui');
const emojis = require('../media/emojis.json');
const { MessageFlags } = require('discord.js');

const V2 = MessageFlags.IsComponentsV2;
const NO = { parse: [] };

async function pager(ctx, { total, render, extra = null, handle = null, loadMore = null, user, send, timeout = 600000 }) {
  const id = `pg_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const count = () => (typeof total === 'function' ? total() : total);
  let at = 0;
  const view = (off = false) => {
    const c = render(at);
    c.addActionRowComponents(ui.row(
      ui.btn(`${id}_p`, null, { emoji: emojis.arrow_left || '◀', disabled: off || at === 0 }),
      ui.btn(`${id}_n`, null, { emoji: emojis.arrow_right || '▶', disabled: off || (at >= count() - 1 && !loadMore) }),
      ...(extra ? extra(at, id) : []),
      ui.deleteBtn(`${id}_x`).setDisabled(off),
    ));
    return c;
  };
  const msg = await send(view());
  if (count() < 2 && !extra && !loadMore) return msg;
  if (!msg?.createMessageComponentCollector) return msg;
  const col = msg.createMessageComponentCollector({ filter: ui.onlyUser(user.id), time: timeout });
  col.on('collect', async (i) => {
    try {
      if (i.customId === `${id}_x`) { col.stop('deleted'); return msg.delete().catch(() => {}); }
      if (handle && !i.customId.startsWith(`${id}_p`) && !i.customId.startsWith(`${id}_n`) && await handle(i, at, id)) return;
      if (i.customId === `${id}_p`) at = Math.max(0, at - 1);
      if (i.customId === `${id}_n`) {
        if (at >= count() - 1 && loadMore) {
          await i.deferUpdate();
          const added = await loadMore().catch(() => false);
          if (added && at < count() - 1) at++;
          if (!added) loadMore = null;
          return i.editReply({ components: [view()], flags: V2, allowedMentions: NO });
        }
        at = Math.min(count() - 1, at + 1);
      }
      await i.update({ components: [view()], flags: V2, allowedMentions: NO });
    } catch (e) { console.error('[pager]', e.message); }
  });
  col.on('end', (_, why) => { if (why !== 'deleted') msg.edit({ components: [view(true)], flags: V2 }).catch(() => {}); });
  return msg;
}

module.exports = { pager };
