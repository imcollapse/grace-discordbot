// Family — pure relationship logic over a snapshot.
//
// snapshot = {
//   people:   Set<userId>
//   spouse:   Map<userId, userId>
//   parents:  Map<childId, userId[]>      (1 or 2 ids)
//   children: Map<parentId, userId[]>
// }
// relate(S, a, b) answers "what is b to a?" → { kind, label, reverse, close }

const par = (S, x) => S.parents.get(x) || [];
const kids = (S, x) => S.children.get(x) || [];
const spouseOf = (S, x) => S.spouse.get(x) || null;

/** Map<ancestorId, depth> (parent = 1, grandparent = 2 …). */
function ancestors(S, x, max = 8) {
    const out = new Map();
    let layer = [x];
    for (let d = 1; d <= max && layer.length; d++) {
        const next = [];
        for (const p of layer) for (const q of par(S, p)) if (!out.has(q) && q !== x) { out.set(q, d); next.push(q); }
        layer = next;
    }
    return out;
}

/** Map<siblingId, 'full' | 'half'> */
function siblings(S, x) {
    const mine = par(S, x);
    const out = new Map();
    for (const p of mine) {
        for (const c of kids(S, p)) {
            if (c === x) continue;
            const theirs = par(S, c);
            const shared = mine.filter((m) => theirs.includes(m)).length;
            const full = mine.length === 2 && theirs.length === 2 && shared === 2;
            if (!out.has(c) || full) out.set(c, full ? 'full' : 'half');
        }
    }
    return out;
}

const greats = (n) => (n <= 1 ? '' : n === 2 ? 'Grand' : `${'Great-'.repeat(n - 2)}grand`);
const upLabel = (d) => (d === 1 ? 'Parent' : `${greats(d)}parent`);
const downLabel = (d) => (d === 1 ? 'Child' : `${greats(d)}child`);

const REVERSE = {
    Spouse: 'Spouse', Sibling: 'Sibling', 'Half-sibling': 'Half-sibling', Cousin: 'Cousin',
    'Uncle / Aunt': 'Nephew / Niece', 'Nephew / Niece': 'Uncle / Aunt',
    'Step-parent': 'Step-child', 'Step-child': 'Step-parent', 'Step-sibling': 'Step-sibling',
    'Parent-in-law': 'Child-in-law', 'Child-in-law': 'Parent-in-law', 'Sibling-in-law': 'Sibling-in-law',
    'Extended family': 'Extended family',
};
const CLOSE = new Set(['Parent', 'Child', 'Sibling', 'Half-sibling', 'Uncle / Aunt', 'Nephew / Niece', 'Step-parent', 'Step-child', 'Step-sibling']);

function reverseOf(label) {
    if (REVERSE[label]) return REVERSE[label];
    if (/parent$/.test(label) && !/Step|in-law/.test(label)) return label.replace(/parent$/, 'child');
    if (/child$/.test(label) && !/Step|in-law/.test(label)) return label.replace(/child$/, 'parent');
    return label;
}

function relate(S, a, b) {
    const make = (kind, label) => ({ kind, label, reverse: reverseOf(label), close: CLOSE.has(label) || /^(Grand|Great)/.test(label) });
    if (a === b) return { kind: 'self', label: 'Yourself', reverse: 'Yourself', close: true };

    if (spouseOf(S, a) === b) return make('spouse', 'Spouse');

    const up = ancestors(S, a);
    if (up.has(b)) return make('ancestor', upLabel(up.get(b)));
    const down = ancestors(S, b);
    if (down.has(a)) return make('descendant', downLabel(down.get(a)));

    const sibs = siblings(S, a);
    if (sibs.has(b)) return make('sibling', sibs.get(b) === 'full' ? 'Sibling' : 'Half-sibling');

    // uncle / aunt (b is a sibling of one of a's parents) and nephew / niece
    for (const p of par(S, a)) if (siblings(S, p).has(b)) return make('uncle', 'Uncle / Aunt');
    for (const p of par(S, b)) if (siblings(S, p).has(a)) return make('nephew', 'Nephew / Niece');

    // cousins: one of a's parents and one of b's parents are siblings
    for (const pa of par(S, a)) { const sp = siblings(S, pa); for (const pb of par(S, b)) if (sp.has(pb)) return make('cousin', 'Cousin'); }

    // step relations
    for (const p of par(S, a)) { const sp = spouseOf(S, p); if (sp && sp === b && !par(S, a).includes(b)) return make('step', 'Step-parent'); }
    for (const p of par(S, b)) { const sp = spouseOf(S, p); if (sp && sp === a && !par(S, b).includes(a)) return make('step', 'Step-child'); }
    const mySpouse = spouseOf(S, a);
    if (mySpouse) {
        if (par(S, b).includes(mySpouse) && !par(S, b).includes(a)) return make('step', 'Step-child');
        if (par(S, mySpouse).includes(b)) return make('inlaw', 'Parent-in-law');
        if (siblings(S, mySpouse).has(b)) return make('inlaw', 'Sibling-in-law');
    }
    for (const c of kids(S, a)) if (spouseOf(S, c) === b) return make('inlaw', 'Child-in-law');
    for (const s of siblings(S, a).keys()) if (spouseOf(S, s) === b) return make('inlaw', 'Sibling-in-law');
    for (const p of par(S, a)) { const sp = spouseOf(S, p); if (sp) for (const c of kids(S, sp)) if (c === b && !sibs.has(b)) return make('step', 'Step-sibling'); }

    if (S.people.has(b)) return make('distant', 'Extended family');
    return null;
}

module.exports = { relate, ancestors, siblings, reverseOf, par, kids, spouseOf };
