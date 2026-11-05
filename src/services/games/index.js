// grace · two player mini games for /play. They work in DMs, on a user install and in servers.
// Buttons carry `gm:<gameId>:<action>[:arg]`. A game lives in memory and ends after 5 idle minutes.
// Games: tictactoe, connect4, rps (best of 3), quickdraw, trivia. Without an opponent the bot plays (trivia is solo).

const crypto = require('crypto');
const ui = require('../ui');

const games = new Map();
const IDLE = 5 * 60000;
const NOMENTION = { allowedMentions: { parse: [], repliedUser: false } };
const rid = (n) => crypto.randomInt(n);
const mention = (id) => (id === 'bot' ? 'grace' : `<@${id}>`);
const E = (description, kind = 'base') => ui.embed({ kind, description });
const btn = (g, action, label, o = {}) => ui.btn(`gm:${g.id}:${action}`, label, o);

/* ── lifecycle ─────────────────────────────────────────────────────── */

function touch(g) {
    clearTimeout(g.idle);
    g.idle = setTimeout(() => end(g, 'this game timed out'), IDLE);
}
function end(g, note) {
    if (!games.has(g.id)) return;
    games.delete(g.id);
    clearTimeout(g.idle); clearTimeout(g.timer);
    if (note) g.origin.editReply({ embeds: [E(`${g.last ?? ''}\n-# ${note}`.trim())], components: [] }).catch(() => {});
}
const done = (g, i, text, kind = 'success') => {
    games.delete(g.id); clearTimeout(g.idle); clearTimeout(g.timer);
    return i.update({ embeds: [E(text, kind)], components: g.finalRows ? g.finalRows() : [] });
};

/* ── tic tac toe ───────────────────────────────────────────────────── */

const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winner3 = (b) => { for (const [x, y, z] of LINES3) if (b[x] !== null && b[x] === b[y] && b[y] === b[z]) return b[x]; return null; };
function botMove3(b, me) {
    const free = b.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    const tryLine = (who) => { for (const [x, y, z] of LINES3) { const cells = [x, y, z]; const mine = cells.filter((c) => b[c] === who).length; const empty = cells.filter((c) => b[c] === null); if (mine === 2 && empty.length === 1) return empty[0]; } return null; };
    return tryLine(me) ?? tryLine(1 - me) ?? (b[4] === null ? 4 : free[rid(free.length)]);
}
const ttt = {
    start: (g) => { g.board = Array(9).fill(null); g.turn = 0; },
    view(g) {
        const rows = [0, 1, 2].map((r) => ui.row(...[0, 1, 2].map((c) => {
            const i = r * 3 + c, v = g.board[i];
            return btn(g, `m:${i}`, v === null ? '-' : v === 0 ? 'X' : 'O', { style: v === null ? 'secondary' : v === 0 ? 'primary' : 'danger', disabled: v !== null || !!g.over });
        })));
        return { embeds: [E(`**tic tac toe**\n> X · ${mention(g.players[0])}\n> O · ${mention(g.players[1])}\n-# ${mention(g.players[g.turn])}'s turn`)], components: rows };
    },
    async onButton(g, i, action, arg) {
        if (action !== 'm') return;
        const idx = Number(arg);
        if (g.players[g.turn] !== i.user.id) return i.reply({ content: 'It is not your turn.', ephemeral: true });
        if (g.board[idx] !== null) return i.reply({ content: 'That spot is taken.', ephemeral: true });
        g.board[idx] = g.turn;
        const finish = (text, kind) => { g.over = true; const v = ttt.view(g); games.delete(g.id); clearTimeout(g.idle); return i.update({ embeds: [E(`${v.embeds[0].data.description.split('\n-#')[0]}\n${text}`, kind)], components: v.components }); };
        let w = winner3(g.board);
        if (w !== null) return finish(`**${mention(g.players[w])} wins**`, 'success');
        if (!g.board.includes(null)) return finish('**a draw**', 'warning');
        g.turn = 1 - g.turn;
        if (g.players[g.turn] === 'bot') {
            g.board[botMove3(g.board, g.turn)] = g.turn;
            w = winner3(g.board);
            if (w !== null) return finish(`**${mention(g.players[w])} wins**`, w === 1 ? 'error' : 'success');
            if (!g.board.includes(null)) return finish('**a draw**', 'warning');
            g.turn = 0;
        }
        touch(g);
        return i.update(ttt.view(g));
    },
};

/* ── connect four ──────────────────────────────────────────────────── */

const ROWS = 6, COLS = 7;
function drop(board, col, who) { for (let r = ROWS - 1; r >= 0; r--) if (board[r][col] === null) { board[r][col] = who; return r; } return -1; }
function win4(board, r, c) {
    const who = board[r][c];
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        let n = 1;
        for (const s of [1, -1]) { let y = r + dr * s, x = c + dc * s; while (y >= 0 && y < ROWS && x >= 0 && x < COLS && board[y][x] === who) { n++; y += dr * s; x += dc * s; } }
        if (n >= 4) return true;
    }
    return false;
}
function botCol4(board, me) {
    const cols = [...Array(COLS).keys()].filter((c) => board[0][c] === null);
    const wins = (who) => cols.find((c) => { const b = board.map((r) => [...r]); const r = drop(b, c, who); return win4(b, r, c); });
    const w = wins(me) ?? wins(1 - me);
    if (w !== undefined) return w;
    const order = [3, 2, 4, 1, 5, 0, 6].filter((c) => cols.includes(c));
    return order[rid(Math.min(3, order.length))];
}
const c4 = {
    start: (g) => { g.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); g.turn = 0; },
    render: (g) => '```\n1 2 3 4 5 6 7\n' + g.board.map((r) => r.map((v) => (v === null ? '.' : v === 0 ? 'R' : 'Y')).join(' ')).join('\n') + '\n```',
    view(g) {
        const full = (c) => g.board[0][c] !== null;
        const mk = (cols) => ui.row(...cols.map((c) => btn(g, `c:${c}`, String(c + 1), { disabled: full(c) || !!g.over })));
        return { embeds: [E(`**connect four**\n> R · ${mention(g.players[0])}\n> Y · ${mention(g.players[1])}\n${c4.render(g)}-# ${mention(g.players[g.turn])}'s turn`)], components: [mk([0, 1, 2, 3]), mk([4, 5, 6])] };
    },
    async onButton(g, i, action, arg) {
        if (action !== 'c') return;
        const col = Number(arg);
        if (g.players[g.turn] !== i.user.id) return i.reply({ content: 'It is not your turn.', ephemeral: true });
        const r = drop(g.board, col, g.turn);
        if (r < 0) return i.reply({ content: 'That column is full.', ephemeral: true });
        const finish = (text, kind) => { g.over = true; const v = c4.view(g); games.delete(g.id); clearTimeout(g.idle); return i.update({ embeds: [E(`**connect four**\n${c4.render(g)}${text}`, kind)], components: v.components }); };
        if (win4(g.board, r, col)) return finish(`**${mention(g.players[g.turn])} wins**`, g.players[g.turn] === 'bot' ? 'error' : 'success');
        if (g.board[0].every((v) => v !== null)) return finish('**a draw**', 'warning');
        g.turn = 1 - g.turn;
        if (g.players[g.turn] === 'bot') {
            const bc = botCol4(g.board, g.turn), br = drop(g.board, bc, g.turn);
            if (win4(g.board, br, bc)) return finish('**grace wins**', 'error');
            if (g.board[0].every((v) => v !== null)) return finish('**a draw**', 'warning');
            g.turn = 0;
        }
        touch(g);
        return i.update(c4.view(g));
    },
};

/* ── rock paper scissors (best of 3) ───────────────────────────────── */

const RPS = ['rock', 'paper', 'scissors'];
const rps = {
    start: (g) => { g.score = [0, 0]; g.picks = [null, null]; g.round = 1; },
    view(g, note = '') {
        const picked = g.picks.map((p) => p !== null);
        return {
            embeds: [E(`**rock paper scissors** · best of 3\n> ${mention(g.players[0])} · **${g.score[0]}**\n> ${mention(g.players[1])} · **${g.score[1]}**\n${note}-# round ${g.round} · ${picked[0] ? 'first player has picked' : 'waiting for the first player'}${g.players[1] === 'bot' ? '' : picked[1] ? ', second has picked' : ', waiting for the second'}`)],
            components: [ui.row(...RPS.map((n, k) => btn(g, `p:${k}`, n, { style: 'primary' })))],
        };
    },
    async onButton(g, i, action, arg) {
        if (action !== 'p') return;
        const side = g.players.indexOf(i.user.id);
        if (g.picks[side] !== null) return i.reply({ content: 'You already picked this round.', ephemeral: true });
        g.picks[side] = Number(arg);
        if (g.players[1] === 'bot') g.picks[1] = rid(3);
        if (g.picks.some((p) => p === null)) { touch(g); await i.reply({ content: `You picked **${RPS[arg]}**. Waiting for the other player.`, ephemeral: true }); return g.origin.editReply(rps.view(g)).catch(() => {}); }
        const [a, b] = g.picks;
        let note;
        if (a === b) note = `> both picked **${RPS[a]}**, round is a tie\n`;
        else { const w = (a + 2) % 3 === b ? 0 : 1; g.score[w]++; note = `> **${RPS[a]}** vs **${RPS[b]}**, ${mention(g.players[w])} takes the round\n`; }
        g.picks = [null, null];
        if (g.score[0] === 2 || g.score[1] === 2) {
            const w = g.score[0] === 2 ? 0 : 1;
            return done(g, i, `**rock paper scissors**\n> ${mention(g.players[0])} · **${g.score[0]}**\n> ${mention(g.players[1])} · **${g.score[1]}**\n${note}**${mention(g.players[w])} wins the match**`, g.players[w] === 'bot' ? 'error' : 'success');
        }
        g.round++; touch(g);
        return i.update(rps.view(g, note));
    },
};

/* ── quick draw ────────────────────────────────────────────────────── */

const quick = {
    start(g) { g.phase = 'wait'; },
    view(g) {
        const go = g.phase === 'go';
        return {
            embeds: [E(`**quick draw**\n> ${mention(g.players[0])} vs ${mention(g.players[1])}\n${go ? '**now! press shoot**' : '-# wait for it, and don\'t press early'}`, go ? 'success' : 'base')],
            components: [ui.row(btn(g, 'shoot', go ? 'Shoot' : 'Wait', { style: go ? 'success' : 'secondary' }))],
        };
    },
    arm(g) {
        g.timer = setTimeout(() => { g.phase = 'go'; g.firedAt = Date.now(); g.origin.editReply(quick.view(g)).catch(() => {}); }, 2000 + rid(5000));
    },
    async onButton(g, i, action) {
        if (action !== 'shoot') return;
        const other = g.players.find((p) => p !== i.user.id);
        if (g.phase === 'wait') return done(g, i, `**quick draw**\n**${mention(i.user.id)} fired too early**\n> ${mention(other)} wins`, 'warning');
        return done(g, i, `**quick draw**\n**${mention(i.user.id)} wins**\n> reaction time ${Date.now() - g.firedAt} ms`);
    },
};

/* ── trivia ────────────────────────────────────────────────────────── */

const ROUNDS = 5, ROUND_MS = 15000;
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const trivia = {
    async start(g) {
        const res = await fetch(`https://opentdb.com/api.php?amount=${ROUNDS}&type=multiple&encode=url3986`, { signal: AbortSignal.timeout(8000) });
        const j = await res.json();
        if (!j.results?.length) throw new Error('no questions');
        g.qs = j.results.map((q) => {
            const answers = [...q.incorrect_answers.map(dec), dec(q.correct_answer)];
            for (let k = answers.length - 1; k > 0; k--) { const m = rid(k + 1); [answers[k], answers[m]] = [answers[m], answers[k]]; }
            return { q: dec(q.question), cat: dec(q.category), answers, right: answers.indexOf(dec(q.correct_answer)) };
        });
        g.i = 0; g.score = {}; g.players.forEach((p) => { g.score[p] = 0; }); g.answered = {};
    },
    scoreLine: (g) => g.players.map((p) => `${mention(p)} · **${g.score[p]}**`).join(' · '),
    view(g, note = '') {
        const q = g.qs[g.i];
        return {
            embeds: [E(`**trivia** · question ${g.i + 1}/${g.qs.length}\n${note}> ${q.q.slice(0, 300)}\n-# ${q.cat} · ${trivia.scoreLine(g)}\n-# right answer is 2 points · ${ROUND_MS / 1000}s`)],
            components: [ui.row(...q.answers.map((a, k) => btn(g, `a:${k}`, a.slice(0, 80), { style: 'primary' })))],
        };
    },
    arm(g) { clearTimeout(g.timer); g.timer = setTimeout(() => trivia.resolve(g, null, 'time is up'), ROUND_MS); },
    async resolve(g, i, why) {
        clearTimeout(g.timer);
        const q = g.qs[g.i];
        const note = `> ${why}, the answer was **${q.answers[q.right]}**\n`;
        g.i++; g.answered = {};
        if (g.i >= g.qs.length) {
            const scores = g.players.map((p) => g.score[p]);
            const best = Math.max(...scores);
            const winners = g.players.filter((p) => g.score[p] === best);
            const result = g.players.length === 1 ? `you got **${scores[0]}** points` : winners.length > 1 ? '**a draw**' : `**${mention(winners[0])} wins**`;
            games.delete(g.id); clearTimeout(g.idle);
            const body = { embeds: [E(`**trivia finished**\n${note}${trivia.scoreLine(g)}\n${result}`)], components: [] };
            return i ? i.update(body) : g.origin.editReply(body).catch(() => {});
        }
        touch(g); trivia.arm(g);
        const v = trivia.view(g, note);
        return i ? i.update(v) : g.origin.editReply(v).catch(() => {});
    },
    async onButton(g, i, action, arg) {
        if (action !== 'a') return;
        if (g.answered[i.user.id]) return i.reply({ content: 'You already answered this question.', ephemeral: true });
        const q = g.qs[g.i], correct = Number(arg) === q.right;
        g.answered[i.user.id] = { correct, at: Date.now() };
        if (correct) {
            const first = !Object.entries(g.answered).some(([u, a]) => u !== i.user.id && a.correct);
            g.score[i.user.id] += first ? 2 : 1;
            return trivia.resolve(g, i, `${mention(i.user.id)} got it`);
        }
        if (g.players.length === 1 || Object.keys(g.answered).length >= g.players.length) return trivia.resolve(g, i, g.players.length === 1 ? 'wrong answer' : 'nobody got it');
        return i.reply({ content: 'Wrong answer. The other player can still answer.', ephemeral: true });
    },
};

/* ── starting a game ───────────────────────────────────────────────── */

const TYPES = { tictactoe: ttt, connect4: c4, rps, quickdraw: quick, trivia };
const LABEL = { tictactoe: 'tic tac toe', connect4: 'connect four', rps: 'rock paper scissors', quickdraw: 'quick draw', trivia: 'trivia' };

async function begin(g, reply) {
    const t = TYPES[g.type];
    await t.start(g);
    games.set(g.id, g);
    touch(g);
    await reply(t.view(g));
    if (t.arm) t.arm(g);
}

/** /game <game> [opponent]. `interaction` is the slash command. */
async function play(interaction, type, opponent) {
    const me = interaction.user;
    const t = TYPES[type];
    if (opponent?.bot) opponent = null;                         // other bots can't play, grace plays instead
    if (opponent && opponent.id === me.id) return interaction.reply({ embeds: [E('You can\'t play against yourself.', 'error')], ephemeral: true });
    if (type === 'quickdraw' && !opponent) return interaction.reply({ embeds: [E('Quick draw needs an opponent. Pick someone with the `opponent` option.', 'error')], ephemeral: true });

    const g = { id: crypto.randomBytes(4).toString('hex'), type, origin: interaction, players: [me.id, opponent ? opponent.id : 'bot'] };
    if (type === 'trivia' && !opponent) g.players = [me.id];

    if (!opponent) {
        await interaction.deferReply();
        try { await begin(g, (v) => interaction.editReply(v)); }
        catch { games.delete(g.id); await interaction.editReply({ embeds: [E('I couldn\'t start that game right now, try again in a moment.', 'error')] }); }
        return;
    }
    // ask the opponent first
    g.pending = true;
    games.set(g.id, g);
    g.timer = setTimeout(() => { if (g.pending) end(g, 'the challenge expired'); }, 60000);
    g.last = `**${LABEL[type]}**\n> ${mention(me.id)} challenged ${mention(opponent.id)}`;
    await interaction.reply({
        embeds: [E(`${g.last}\n-# ${opponent.username}, press accept to play`)],
        components: [ui.row(btn(g, 'accept', 'Accept', { style: 'success' }), btn(g, 'decline', 'Decline', { style: 'danger' }))],
        ...NOMENTION,
    });
}

/** Every `gm:` button goes through here. */
async function handle(i) {
    const [, id, action, arg] = i.customId.split(':');
    const g = games.get(id);
    if (!g) return i.reply({ content: 'That game is over.', ephemeral: true }).catch(() => {});
    try {
        if (g.pending) {
            if (i.user.id !== g.players[1]) return i.reply({ content: 'Only the challenged player can answer.', ephemeral: true });
            clearTimeout(g.timer);
            if (action === 'decline') { games.delete(g.id); return i.update({ embeds: [E(`${g.last}\n**declined**`, 'warning')], components: [] }); }
            if (action !== 'accept') return;
            g.pending = false;
            await i.deferUpdate();
            try { await begin(g, (v) => g.origin.editReply(v)); }
            catch { games.delete(g.id); return g.origin.editReply({ embeds: [E('I couldn\'t start that game right now, try again in a moment.', 'error')], components: [] }).catch(() => {}); }
            return;
        }
        if (!g.players.includes(i.user.id)) return i.reply({ content: 'You are not in this game.', ephemeral: true });
        return await TYPES[g.type].onButton(g, i, action, arg);
    } catch (err) {
        console.error('[games]', err.message);
        games.delete(g.id);
        i.reply({ content: 'Something went wrong with that game.', ephemeral: true }).catch(() => {});
    }
}

module.exports = { play, handle, TYPES, LABEL, games };
