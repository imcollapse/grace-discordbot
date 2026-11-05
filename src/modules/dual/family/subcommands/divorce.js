const engine = require('../../../../services/family/engine');
const V = require('../../../../services/family/views');

module.exports = {
    async execute(w) {
        const snap = await engine.snapshot(w.user.id, 2);
        const partner = snap.spouse.get(w.user.id);
        if (!partner) return w.say('bad', 'You\'re not married', 'There is nobody to divorce.');

        const c = await V.confirm(w, { title: 'End your marriage?', body: `You and <@${partner}> will no longer be married. Children stay with the parent who adopted them.`, yes: 'Divorce' });
        if (!c.ok) return;
        const r = await engine.divorce(w.user.id);
        if (!r.ok) return c.show(V.note('bad', 'Nothing changed', 'You\'re not married any more.'));
        return c.show(V.note('ok', 'Marriage ended', `You and <@${r.ex}> are no longer married.${r.kids ? `\n${r.kids} shared ${r.kids === 1 ? 'child stays' : 'children stay'} with their original parent.` : ''}`));
    },
};
