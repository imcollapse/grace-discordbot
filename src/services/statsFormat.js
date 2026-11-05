// grace · how counts are shown to people: 2.4K servers, 130K users, 480 commands.
// The console keeps the exact numbers.

const nf = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const compact = (n) => nf.format(Number(n) || 0);

/** Real command count: every command and subcommand in the help registry. */
function commandTotal(client) {
  try {
    const help = require('./helpMenu');
    const n = help.totalCommands?.();
    if (n > 0) return n;
  } catch (_) { /* fall through */ }
  return (client?.commands?.size ?? 0) + (client?.prefixCommands?.size ?? 0);
}

/** The exact number, no plus sign. */
const commandLabel = (n) => String(Number(n) || 0);

module.exports = { compact, commandTotal, commandLabel };
