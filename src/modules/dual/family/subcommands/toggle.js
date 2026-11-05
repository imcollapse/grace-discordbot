const engine = require('../../../../services/family/engine');
const V = require('../../../../services/family/views');

const COPY = {
    proposals: { title: 'Marriage proposals', on: 'People can propose to you.', off: 'Nobody can propose to you.' },
    adoptions: { title: 'Adoption offers', on: 'People can offer to adopt you.', off: 'Nobody can offer to adopt you.' },
};

function view(key, state) {
    const c = COPY[key];
    const box = V.note(state ? 'ok' : 'warn', `${c.title}: ${state ? 'On' : 'Off'}`, state ? c.on : c.off, 'Use the button to switch');
    box.addActionRowComponents(V.ui.row(V.ui.btn(`fam_toggle_${key}`, state ? 'Turn off' : 'Turn on', { style: state ? 'danger' : 'success' })));
    return box;
}

/** key: 'proposals' | 'adoptions' */
module.exports = (key) => ({
    async execute(w) {
        let enabled = null;
        if (w.slash) enabled = w.raw.options.getBoolean('enabled');
        else {
            const a = (w.args[0] || '').toLowerCase();
            if (['on', 'true', 'yes', 'enable', 'enabled'].includes(a)) enabled = true;
            else if (['off', 'false', 'no', 'disable', 'disabled'].includes(a)) enabled = false;
        }
        let state = enabled === null ? (await engine.getSettings(w.user.id))[key] : (await engine.setSetting(w.user.id, key, enabled))[key];

        const msg = await w.reply(view(key, state), { ephemeral: true });
        const col = msg.createMessageComponentCollector({ time: 60000, filter: V.ui.onlyUser(w.user.id) });
        col.on('collect', async (i) => {
            if (i.customId !== `fam_toggle_${key}`) return;
            try {
                state = (await engine.setSetting(i.user.id, key, !state))[key];
                await i.update({ components: [view(key, state)], flags: V.V2 });
            } catch (_) {}
        });
        col.on('end', () => {
            const box = V.note(state ? 'ok' : 'warn', `${COPY[key].title}: ${state ? 'On' : 'Off'}`, state ? COPY[key].on : COPY[key].off);
            msg.edit({ components: [box], flags: V.V2 }).catch(() => {});
        });
    },
});
