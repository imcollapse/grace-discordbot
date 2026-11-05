/*
 * grace · hot reloader
 *
 * Re-reads source files while the bot is running.
 *   - command files (modules/interactions, modules/text, modules/dual) are re-registered
 *   - event files (events/*.js) are swapped in place (bootstrap resolves them from require.cache)
 *   - any other file is dropped from the require cache together with everything that depends on it
 *   - locale bundles and emojis.json are refreshed in place
 *
 * A file that fails to load keeps its previous working version, so a typo never takes a command down.
 * Files that hold live state (database, settings, the music engine, …) are protected: use `reboot` for those.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const SRC = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'logs', 'bundled', 'locales']);

const PROTECTED = [
    /^bootstrap\.js$/,
    /^settings\//,
    /^database\//,
    /^localization\//,
    /^services\/music\/(index|events|voice|session)\.js$/,
    /^services\/(consoleLogger|botLogger|logger|commandLoader|reloader|restart|emojiSync|presence|branding|cooldown|containerUi|embedUi|ticketAutomation)\.js$/,
    /^events\/(logging|antinuke|automod)\//,
    /^events\/(stats\w*Tracker|trackUser\w+|ready\w+)\.js$/,
];

const toRel = (abs) => path.relative(SRC, abs).split(path.sep).join('/');
const toAbs = (rel) => path.join(SRC, ...rel.split('/'));
const isProtected = (rel) => PROTECTED.some((re) => re.test(rel));

function walk(dir = SRC, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
        } else if (e.isFile() && e.name.endsWith('.js')) {
            out.push(toRel(path.join(dir, e.name)));
        }
    }
    return out;
}

/** What a file is, using the same rules as services/commandLoader. */
function kindOf(rel) {
    if (rel.startsWith('modules/interactions/')) return rel.includes('/subcommands/') ? 'support' : 'slash';
    if (rel.startsWith('modules/text/')) {
        const parts = rel.slice('modules/text/'.length).split('/');
        if (parts.length > 2) return 'support';
        if (parts.length === 2 && parts[1] !== `${parts[0]}.js` && fs.existsSync(toAbs(`modules/text/${parts[0]}/${parts[0]}.js`))) return 'support';
        return 'prefix';
    }
    if (rel.startsWith('modules/dual/')) {
        const parts = rel.slice('modules/dual/'.length).split('/');
        return parts.length === 2 && parts[1] === `${parts[0]}.js` ? 'hybrid' : 'support';
    }
    if (/^events\/[^/]+\.js$/.test(rel)) return 'event';
    return 'support';
}

/** An event module with `init` registers its own listeners, so it can only be changed by a reboot. */
const hasInit = (abs) => typeof require.cache[abs]?.exports?.init === 'function';

function syntaxCheck(abs) {
    const src = fs.readFileSync(abs, 'utf8').replace(/^#!.*/, '');
    new vm.Script(Module.wrap(src), { filename: abs });
}

/* ── command registry ──────────────────────────────────────────────── */

/** Removes every registry entry (name or alias) that still points at `mod`. */
function unregister(client, mod) {
    for (const col of [client.commands, client.prefixCommands]) {
        for (const [k, v] of [...col.entries()]) if (v === mod) col.delete(k);
    }
}

function register(client, kind, mod) {
    if (kind !== 'prefix' && mod?.data && mod.execute) client.commands.set(mod.data.name, mod);
    if (kind !== 'slash' && mod?.name && mod.execute) {
        client.prefixCommands.set(mod.name, mod);
        if (Array.isArray(mod.aliases)) for (const a of mod.aliases) client.prefixCommands.set(a, mod);
    }
}

const slashJson = (mod) => { try { return JSON.stringify(mod?.data?.toJSON?.()); } catch { return undefined; } };

/* ── dependency graph ──────────────────────────────────────────────── */

function dependentsOf(seed) {
    const parents = new Map();
    for (const m of Object.values(require.cache)) {
        if (!m?.children) continue;
        for (const c of m.children) {
            if (!parents.has(c.filename)) parents.set(c.filename, new Set());
            parents.get(c.filename).add(m.filename);
        }
    }
    const out = new Set();
    const queue = [...seed];
    while (queue.length) {
        const cur = queue.pop();
        for (const p of parents.get(cur) || []) {
            if (seed.has(p) || out.has(p)) continue;
            if (!p.startsWith(SRC + path.sep) || p.includes(`${path.sep}node_modules${path.sep}`)) continue;
            const rel = toRel(p);
            if (isProtected(rel) || hasInit(p)) continue;
            out.add(p);
            queue.push(p);
        }
    }
    return out;
}

/* ── target resolution ─────────────────────────────────────────────── */

function resolveTerm(term, all) {
    const t = term.toLowerCase().replace(/\\/g, '/').replace(/^\.?\/?(src\/)?/, '').replace(/\.(js|json)$/, '');
    const noExt = (r) => r.replace(/\.js$/, '').toLowerCase();
    const exact = all.filter((r) => noExt(r) === t);
    if (exact.length) return exact;
    return all.filter((r) => noExt(r).endsWith(`/${t}`));
}

/* ── in-place data reloads ─────────────────────────────────────────── */

function swapInPlace(target, data) {
    for (const k of Object.keys(target)) delete target[k];
    Object.assign(target, data);
}

function reloadLocales(res) {
    const i18n = require('../localization');
    for (const [code, bundle] of i18n.bundles) {
        const rel = `localization/locales/${code}.json`;
        try {
            swapInPlace(bundle, JSON.parse(fs.readFileSync(toAbs(rel), 'utf8')));
            res.reloaded.push(rel);
        } catch (e) {
            res.failed.push({ file: rel, error: e.message });
        }
    }
}

function reloadEmojis(res) {
    const rel = 'media/emojis.json';
    try {
        swapInPlace(require(toAbs(rel)), JSON.parse(fs.readFileSync(toAbs(rel), 'utf8')));
        res.reloaded.push(rel);
    } catch (e) {
        res.failed.push({ file: rel, error: e.message });
    }
}

/* ── main entry ────────────────────────────────────────────────────── */

const firstLine = (e) => String(e?.message || e).split('\n')[0].slice(0, 160);

/**
 * terms: ['all'] or file names / paths, e.g. ['play', 'services/ui', 'locales'].
 * Returns { reloaded[], failed[{file,error}], skipped[], notes[], ms }.
 */
function reload(client, terms) {
    const t0 = Date.now();
    const res = { reloaded: [], failed: [], skipped: [], notes: [], ms: 0, all: false };
    const all = walk();
    res.all = terms.some((t) => /^(all|\*)$/i.test(t));

    const picked = new Set();
    let doLocales = false;
    let doEmojis = false;

    if (res.all) {
        doLocales = doEmojis = true;
        all.forEach((r) => picked.add(r));
    } else {
        for (const term of terms) {
            if (/^(locales?|lang(uages?)?|i18n)$/i.test(term)) { doLocales = true; continue; }
            if (/^emojis?$/i.test(term)) { doEmojis = true; continue; }
            const hits = resolveTerm(term, all);
            if (!hits.length) { res.failed.push({ file: term, error: 'no file with that name' }); continue; }
            if (hits.length > 10) { res.failed.push({ file: term, error: `${hits.length} files match, be more specific` }); continue; }
            hits.forEach((r) => picked.add(r));
        }
    }

    const seed = new Set();
    for (const rel of picked) {
        const abs = toAbs(rel);
        if (isProtected(rel) || hasInit(abs)) res.skipped.push(rel); else seed.add(abs);
    }

    if (doEmojis) reloadEmojis(res);
    if (doLocales) reloadLocales(res);

    const set = res.all ? seed : new Set([...seed, ...dependentsOf(seed)]);

    const oldMods = new Map();
    for (const abs of set) oldMods.set(abs, require.cache[abs]);
    for (const abs of set) delete require.cache[abs];

    const restore = (abs) => { if (oldMods.get(abs)) require.cache[abs] = oldMods.get(abs); };
    const live = [...set].map((abs) => ({ abs, rel: toRel(abs), kind: kindOf(toRel(abs)) }));
    let slashChanged = false;

    // plain files first: only a syntax check, they are evaluated lazily by whoever requires them
    for (const f of live.filter((x) => x.kind === 'support')) {
        try { syntaxCheck(f.abs); res.reloaded.push(f.rel); } catch (e) { restore(f.abs); res.failed.push({ file: f.rel, error: firstLine(e) }); }
    }

    // then commands and events, which are really executed and re-registered
    for (const f of live.filter((x) => x.kind !== 'support')) {
        const old = oldMods.get(f.abs)?.exports;
        try {
            const mod = require(f.abs);
            if (f.kind === 'event') {
                if (!(mod && 'name' in mod && 'execute' in mod)) throw new Error('missing name or execute');
            } else {
                register(client, f.kind, mod);
                if (old && slashJson(old) !== slashJson(mod)) slashChanged = true;
                if (old && old !== mod) unregister(client, old); // leftovers: names the new version no longer has
            }
            res.reloaded.push(f.rel);
        } catch (e) {
            restore(f.abs);
            res.failed.push({ file: f.rel, error: firstLine(e) });
        }
    }

    if (slashChanged) res.notes.push('slash command definitions changed, run reboot to sync them with Discord');
    res.ms = Date.now() - t0;
    return res;
}

module.exports = { reload, walk, isProtected, kindOf };
