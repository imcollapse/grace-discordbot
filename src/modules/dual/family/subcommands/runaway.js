const engine = require('../../../../services/family/engine');
const V = require('../../../../services/family/views');

module.exports = {
    async execute(w) {
        const snap = await engine.snapshot(w.user.id, 2);
        const parents = snap.parents.get(w.user.id) || [];
        if (!parents.length) return w.say('bad', 'No parents to leave', 'You aren\'t anyone\'s child right now.');

        const c = await V.confirm(w, { title: 'Run away?', body: `You will leave ${parents.map((p) => `<@${p}>`).join(' and ')}.`, yes: 'Run away' });
        if (!c.ok) return;
        const r = await engine.runaway(w.user.id);
        if (!r.ok) return c.show(V.note('bad', 'Nothing changed', 'You have no parents any more.'));
        return c.show(V.note('ok', 'You left home', `You are no longer a child of ${r.parents.map((p) => `<@${p}>`).join(' and ')}.`));
    },
};
