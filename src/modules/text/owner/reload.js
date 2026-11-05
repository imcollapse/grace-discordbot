// ─── cosmin · developer ───
//
//  reload <file …>   reload one or more files by name   (reload play, reload services/ui users)
//  reload all        reload every file
//  reload locales    refresh the language files   ·   reload emojis   refresh emojis.json

const ui = require('../../../services/ui');
const reloader = require('../../../services/reloader');
const config = require('../../../settings');

const code = (s) => `\`${s}\``;

function usage() {
    return ui.box('base')
        .addTextDisplayComponents(ui.text('### Reload'))
        .addTextDisplayComponents(ui.text([
            `${code('reload <file>')}  reload one or more files`,
            `${code('reload all')}  reload every file`,
            `${code('reload locales')} · ${code('reload emojis')}  refresh data files`,
        ].join('\n')))
        .addSeparatorComponents(ui.sep())
        .addTextDisplayComponents(ui.text(ui.sub('need a full restart? use reboot')));
}

function render(res) {
    const failed = res.failed.length;
    const n = res.reloaded.length;
    const c = ui.box(failed ? 'error' : n ? 'success' : 'warning');

    c.addTextDisplayComponents(ui.text(`### ${failed ? 'Reloaded with errors' : n ? 'Reload complete' : 'Nothing reloaded'}`));

    const head = [`**${n}** ${n === 1 ? 'file' : 'files'} reloaded`];
    if (failed) head.push(`**${failed}** failed`);
    head.push(`${res.ms}ms`);
    c.addTextDisplayComponents(ui.text(head.join(' · ')));

    if (n && n <= 6) c.addTextDisplayComponents(ui.text(res.reloaded.map((f) => ui.sub(f)).join('\n')));

    if (failed) {
        c.addSeparatorComponents(ui.sep());
        const shown = res.failed.slice(0, 8);
        const lines = shown.map((f) => `${code(f.file)}\n${ui.sub(f.error)}`);
        if (res.failed.length > shown.length) lines.push(ui.sub(`and ${res.failed.length - shown.length} more`));
        c.addTextDisplayComponents(ui.text(`**Failed**\n${lines.join('\n')}`));
    }

    const foot = [];
    if (res.skipped.length) {
        foot.push(res.all
            ? `${res.skipped.length} protected files skipped, they need a reboot`
            : `skipped (needs a reboot): ${res.skipped.slice(0, 5).join(', ')}`);
    }
    foot.push(...res.notes);
    if (foot.length) {
        c.addSeparatorComponents(ui.sep());
        c.addTextDisplayComponents(ui.text(foot.map((f) => ui.sub(f)).join('\n')));
    }
    return c;
}

module.exports = {
    name: 'reload',
    description: 'Reload files without restarting the bot',
    aliases: ['rl'],
    ownerOnly: true,

    async execute(message, args) {
        if (message.author.id !== config.OWNER_ID) return;
        if (!args.length) return ui.send(message, usage());

        let res;
        try {
            res = reloader.reload(message.client, args);
        } catch (e) {
            return ui.send(message, ui.fail(`reload crashed: ${String(e.message).slice(0, 300)}`));
        }
        return ui.send(message, render(res));
    },
};
