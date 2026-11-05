const engine = require('../../../../services/family/engine');
const V = require('../../../../services/family/views');

module.exports = {
    async execute(w) {
        const [child] = await w.users(['user']);
        if (!child) return w.say('warn', 'Who?', 'Mention your child: `/family disown user:@child`');
        const snap = await engine.snapshot(w.user.id, 3);
        if (!(snap.children.get(w.user.id) || []).includes(child.id)) return w.say('bad', 'Not your child', `<@${child.id}> isn't one of your children.`);

        const c = await V.confirm(w, { title: 'Disown this child?', body: `<@${child.id}> will no longer be your child.`, yes: 'Disown' });
        if (!c.ok) return;
        const r = await engine.disown(w.user.id, child.id);
        if (!r.ok) return c.show(V.note('bad', 'Nothing changed', `<@${child.id}> isn't your child.`));
        return c.show(V.note('ok', 'Child disowned', `<@${child.id}> is no longer your child.${r.orphaned ? '' : '\nTheir other parent keeps them.'}`));
    },
};
