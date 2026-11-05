// Family — marriage proposals and adoption offers (Accept / Decline / Withdraw buttons).

const engine = require('./engine');
const cards = require('./cards');
const V = require('./views');

const { ui } = V;
const TTL = 120000;
const pending = new Set();

const mention = (id) => `<@${id}>`;
const lower = (s) => String(s || '').toLowerCase();

/** Friendly ephemeral explanation for a failed check. */
function failure(kind, c, target) {
    const t = mention(target.id);
    switch (c.reason) {
        case 'self': return V.note('warn', kind === 'marry' ? 'Marry yourself?' : 'Adopt yourself?', kind === 'marry' ? 'Self-love is great, but a wedding needs two people.' : 'You can\'t be your own parent.');
        case 'you_married': return V.note('warn', 'You\'re already married', `You\'re married to ${mention(c.partner)}. Use \`/family divorce\` first.`);
        case 'they_married': return V.note('bad', 'Already taken', `${t} is already married.`);
        case 'closed': return V.note('bad', kind === 'marry' ? 'Proposals are closed' : 'Adoptions are closed', `${t} isn\'t accepting ${kind === 'marry' ? 'marriage proposals' : 'adoption offers'} right now.`);
        case 'related': return V.note('bad', 'That\'s a bit too close', `${t} is your ${lower(c.relation?.label)}. Family can\'t marry family.`);
        case 'spouse': return V.note('bad', 'That\'s your spouse', `You can\'t adopt your own husband or wife.`);
        case 'has_parent': return V.note('bad', 'Already has a family', `${t} already has parents. They can leave with \`/family runaway\` first.`);
        case 'child_married': return V.note('bad', 'Married people can\'t be adopted', `${t} is married.`);
        case 'ancestor': return V.note('bad', 'Family loop', `${t} is one of your ancestors. You can\'t adopt them.`);
        case 'full': return V.note('bad', 'Your family is full', `You already have **${c.count}/${c.limit}** children.${c.limit < engine.LIMIT.premium ? `\nUser Premium raises the limit to **${engine.LIMIT.premium}**.` : ''}`);
        case 'spouse_full': return V.note('bad', 'Your spouse\'s family is full', `${mention(c.spouse)} already has **${c.count}/${c.limit}** children, and adopted kids are shared between spouses.`);
        default: return V.note('bad', 'Couldn\'t do that', 'Something about this isn\'t allowed right now.');
    }
}

function buttons(stamp, disabled = false) {
    return ui.row(
        ui.btn(`fam_accept_${stamp}`, 'Accept', { style: 'success', disabled }),
        ui.btn(`fam_decline_${stamp}`, 'Decline', { style: 'danger', disabled }),
        ui.btn(`fam_cancel_${stamp}`, 'Withdraw', { disabled }),
    );
}

/**
 * kind: 'marry' | 'adopt'.  The author offers; `target` accepts.
 */
async function start(w, { kind, target }) {
    const author = w.user;
    const check = kind === 'marry' ? await engine.checkMarry(author.id, target.id) : await engine.checkAdopt(author.id, target.id);
    if (!check.ok) return w.reply(failure(kind, check, target), { ephemeral: true });

    const key = `${kind}:${author.id}`;
    if (pending.has(key)) return w.say('warn', 'You already have an open offer', 'Wait for it to be answered, or withdraw it with its button.');
    pending.add(key);

    try {
        await w.defer();
        const [a, b] = await Promise.all([V.person(w.client, author, w.guild), V.person(w.client, target, w.guild)]);
        const stamp = `${Date.now().toString(36)}${author.id.slice(-4)}`;
        const isMarry = kind === 'marry';
        const buf = await cards.pairCard({
            mode: isMarry ? 'propose_marry' : 'propose_adopt', left: a, right: b,
            sub: isMarry ? `${a.name} is asking ${b.name} to be their spouse` : `${a.name} would like to adopt ${b.name}`,
            footer: 'This offer expires in 2 minutes',
        });
        const name = `family-${kind}.png`;
        const lines = isMarry
            ? `${mention(target.id)}, ${mention(author.id)} has proposed to you.`
            : `${mention(target.id)}, ${mention(author.id)} would like to adopt you.${check.spouse ? `\n${mention(check.spouse)} (their spouse) would become your co-parent.` : ''}`;
        const msg = await w.reply(V.panel({ image: name, lines, footer: 'Only the person asked can accept', rows: [buttons(stamp)], color: isMarry ? V.COLOR.rose : V.COLOR.gold }), { files: [V.file(buf, name)] });

        const col = msg.createMessageComponentCollector({ time: TTL });
        let settled = false;

        col.on('collect', async (i) => {
            const id = i.customId;
            if (!id.endsWith(stamp)) return;
            const isTarget = i.user.id === target.id, isAuthor = i.user.id === author.id;
            if (id.startsWith('fam_cancel_') ? !isAuthor : !isTarget) {
                return i.reply({ components: [V.note('warn', 'This isn\'t for you', id.startsWith('fam_cancel_') ? 'Only the person who made the offer can withdraw it.' : `Only ${mention(target.id)} can answer this.`)], flags: V.V2 | V.EPH }).catch(() => {});
            }
            if (settled) return i.deferUpdate().catch(() => {});
            settled = true; col.stop('answered');
            try { await i.deferUpdate(); } catch (_) {}

            const finish = (box, files = []) => i.editReply({ components: [box], files, flags: V.V2, attachments: [] }).catch(() => {});

            if (id.startsWith('fam_decline_')) return finish(V.note('info', 'Declined', `${mention(target.id)} said no to ${mention(author.id)}'s ${isMarry ? 'proposal' : 'adoption offer'}.`));
            if (id.startsWith('fam_cancel_')) return finish(V.note('info', 'Offer withdrawn', `${mention(author.id)} took their ${isMarry ? 'proposal' : 'adoption offer'} back.`));

            // accepted → run the rules again, things may have changed
            const res = isMarry ? await engine.marry(author.id, target.id) : await engine.adopt(author.id, target.id);
            if (!res.ok) return finish(failure(kind, res, target));

            const done = await cards.pairCard(isMarry
                ? { mode: 'married', left: a, right: b, sub: `${a.name} & ${b.name} are now married`, footer: cards.fmtDate(res.at) }
                : { mode: 'adopted', left: a, right: b, sub: `${a.name} adopted ${b.name}`, footer: cards.fmtDate(res.at) });
            const dn = `family-${kind}-done.png`;
            const text = isMarry
                ? `Congratulations ${mention(author.id)} and ${mention(target.id)}!`
                : `Welcome to the family, ${mention(target.id)}! ${mention(author.id)}${res.coParent ? ` and ${mention(res.coParent)} are` : ' is'} now your ${res.coParent ? 'parents' : 'parent'}.`;
            return finish(V.panel({ image: dn, lines: text, footer: isMarry ? 'See your family with /family profile' : 'See the whole family with /family tree', color: isMarry ? V.COLOR.rose : V.COLOR.gold }), [V.file(done, dn)]);
        });

        col.on('end', async (_c, reason) => {
            pending.delete(key);
            if (reason === 'answered') return;
            await msg.edit({ components: [V.panel({ image: name, lines: V.ui.sub(`Offer expired · ${mention(target.id)} didn't answer in time`), rows: [buttons(stamp, true)], color: V.COLOR.lav })], files: [V.file(buf, name)], flags: V.V2, attachments: [] }).catch(() => {});
        });
    } catch (err) {
        pending.delete(key);
        throw err;
    }
}

module.exports = { start, failure };
