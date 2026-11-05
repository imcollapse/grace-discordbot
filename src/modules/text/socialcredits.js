// grace · ,socialcredits (owner) — how many SocialCrawl lookups are left. The balance check itself is free.

const config = require('../../settings');
const ui = require('../../services/ui');
const sc = require('../../services/socialcrawl');

module.exports = {
  name: 'socialcredits',
  aliases: ['sccredits'],
  description: 'Show the remaining social lookup credits',
  ownerOnly: true,

  async execute(message) {
    if (message.author.id !== config.OWNER_ID) return;
    const send = (c) => ui.send(message, c, { extra: { allowedMentions: { parse: [] } } });
    if (!sc.configured()) return send(ui.notice('warning', 'No `SOCIALCRAWL_API_KEY` is set.'));
    try {
      const r = await sc.call('/credits/balance', {}, { fresh: true });
      const d = r?.data ?? {};
      const left = r?.credits_remaining ?? d.credits_remaining ?? d.balance ?? d.credits ?? null;
      return send(ui.notice('success', left === null ? 'The key works, but the balance was not in the answer.' : `**${Number(left).toLocaleString('en')}** credits left.`));
    } catch (e) { return send(ui.notice('error', e.message)); }
  },
};
