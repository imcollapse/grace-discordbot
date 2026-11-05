const engine = require('../../../../services/family/engine');
const cards = require('../../../../services/family/cards');
const V = require('../../../../services/family/views');

module.exports = {
    async execute(w) {
        const users = await w.users(['user', 'user2']);
        const a = users.length > 1 ? users[1] : w.user;   // "user2" defaults to the author
        const b = users[0];
        if (!b) return w.say('warn', 'Who?', 'Mention someone: `/family relationship user:@someone [user2:@other]`');
        if (a.id === b.id) return w.say('warn', 'Pick two different people', 'Mention someone other than yourself, or give a second user.');

        await w.defer();
        const { rel } = await engine.relationship(a.id, b.id);
        if (!rel) return w.say('info', 'Not related', `<@${a.id}> and <@${b.id}> have no family connection.`);

        const [pa, pb] = await Promise.all([V.person(w.client, a, w.guild), V.person(w.client, b, w.guild)]);
        const buf = await cards.pairCard({
            mode: 'relation', title: rel.label, left: pa, right: pb, roles: ['', ''],
            sub: `${pb.name} is ${pa.name}’s ${rel.label.toLowerCase()}`,
            footer: `${pa.name} is ${pb.name}’s ${String(rel.reverse || rel.label).toLowerCase()}`,
        });
        return w.reply(V.panel({ image: 'relation.png', color: V.COLOR.gold }), { files: [V.file(buf, 'relation.png')] });
    },
};
