const engine = require('../../../../services/family/engine');
const V = require('../../../../services/family/views');

module.exports = {
    async execute(w) {
        const p = await engine.profile(w.user.id);
        if (!p.spouse && !p.children.length && !p.parents.length) return w.say('bad', 'You have no family', 'Nothing to leave.');

        const bits = [];
        if (p.spouse) bits.push(`end your marriage to <@${p.spouse}>`);
        if (p.children.length) bits.push(`disown ${p.children.length} ${p.children.length === 1 ? 'child' : 'children'}`);
        if (p.parents.length) bits.push(`leave your parents`);
        const c = await V.confirm(w, { title: 'Leave your whole family?', body: `This will ${bits.join(', ').replace(/, ([^,]*)$/, ' and $1')}. It can\'t be undone.`, yes: 'Leave everything' });
        if (!c.ok) return;
        const r = await engine.leave(w.user.id);
        if (!r.ok) return c.show(V.note('bad', 'Nothing changed', 'You have no family.'));
        const done = [];
        if (r.ex) done.push(`Marriage to <@${r.ex}> ended`);
        if (r.children) done.push(`${r.children} ${r.children === 1 ? 'child' : 'children'} disowned`);
        if (r.parents) done.push('Left your parents');
        return c.show(V.note('ok', 'Fresh start', done.map((d) => `• ${d}`).join('\n')));
    },
};
