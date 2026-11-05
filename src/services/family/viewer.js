// Family — shared Profile / Family tree viewer: one public message, two pages, nav buttons.

const engine = require('./engine');
const cards = require('./cards');
const V = require('./views');

const { ui } = V;

async function open(w, target) {
    await w.defer();
    const p = await engine.profile(target.id);
    if (p.size <= 1) {
        const self = target.id === w.user.id;
        return w.say('info', self ? 'No family yet' : `${target.displayName || target.username} has no family yet`,
            self ? 'Start one with `/family marry` or `/family adopt`.' : 'They are not married and have no parents or children.');
    }

    const stamp = `${Date.now().toString(36)}${w.user.id.slice(-4)}`;
    const ids = { profile: `fam_pg_p_${stamp}`, tree: `fam_pg_t_${stamp}` };
    const cache = {};

    const pick = (id, size) => V.person(w.client, id, w.guild, size);

    async function render(page) {
        if (!cache[page]) {
            if (page === 'profile') {
                const [user, partner, parents, kids, sibs] = await Promise.all([
                    pick(target, 256),
                    p.spouse ? pick(p.spouse, 192) : null,
                    Promise.all(p.parents.map((x) => pick(x, 128))),
                    Promise.all(p.children.slice(0, 7).map((x) => pick(x, 128))),
                    Promise.all(p.siblings.map((x) => pick(x.id, 64))),
                ]);
                const buf = await cards.profileCard({
                    user, partner, marriedAt: p.marriedAt, parents, children: kids, siblings: sibs,
                    size: p.size, limit: p.limit, premium: p.premium, botName: w.client.user?.username,
                });
                const more = p.children.length > 7 ? `+${p.children.length - 7} more children` : '';
                const trunc = p.truncated ? 'Very large family — showing the closest relatives.' : '';
                cache[page] = { name: 'family.png', buf, footer: [more, trunc].filter(Boolean).join('  ·  ') };
            } else {
                const users = new Map();
                await Promise.all([...p.S.people].map(async (id) => users.set(id, await pick(id, 128))));
                const me = users.get(target.id);
                const buf = await cards.treeCard({ S: p.S, users, target: target.id, title: `${me?.name || 'Family'}’s Family` });
                cache[page] = { name: 'tree.png', buf, footer: p.truncated ? 'Very large family — tree is truncated.' : '' };
            }
        }
        return cache[page];
    }

    const build = async (page, disabled = false) => {
        const c = await render(page);
        const row = ui.row(
            ui.btn(ids.profile, 'Profile', { style: page === 'profile' ? 'primary' : 'secondary', disabled }),
            ui.btn(ids.tree, 'Family tree', { style: page === 'tree' ? 'primary' : 'secondary', disabled }),
        );
        return { components: [V.panel({ image: c.name, footer: c.footer, rows: [row], color: V.COLOR.rose })], files: [V.file(c.buf, c.name)] };
    };

    let page = w.page || 'profile';
    const first = await build(page);
    const msg = await w.reply(first.components, { files: first.files });
    if (typeof msg?.createMessageComponentCollector !== 'function') return msg;

    const col = msg.createMessageComponentCollector({ time: 180000, filter: ui.onlyUser(w.user.id) });
    col.on('collect', async (i) => {
        const next = i.customId === ids.tree ? 'tree' : i.customId === ids.profile ? 'profile' : null;
        if (!next) return;
        try {
            await i.deferUpdate();
            page = next;
            const v = await build(page);
            await i.editReply({ components: v.components, files: v.files, attachments: [], flags: V.V2 });
            col.resetTimer();
        } catch (err) { console.error('[Family] viewer error:', err); }
    });
    col.on('end', async () => {
        try {
            const v = await build(page, true);
            await msg.edit({ components: v.components, files: v.files, attachments: [], flags: V.V2 });
        } catch (_) {}
    });
    return msg;
}

module.exports = { open };
