// grace · economy commands. Prefix only. modules/text/eco/<name>.js each call build('<name>').
// Look: classic embeds, "**name did X** ♡" then a quoted result and a small balance line.

const { PermissionFlagsBits: P } = require('discord.js');
const ui = require('../ui');
const { icon, pre } = require('../icons');
const prem = require('../premium');
const views = () => require('../premium/views');
const db = require('../../database/economy');
const D = require('./data');

const { n, rand, chance } = D;
const HEART = '♡';
const NOMENTION = { allowedMentions: { parse: [], repliedUser: false } };

/* ── small helpers ─────────────────────────────────────────────────── */

const coin = () => icon('eco_coin', '');
/** 1,250 with the coin emoji, or "1,250 coins" while the emoji is not set. */
const money = (v, g) => (coin() ? `${coin()} **${n(v)}**` : `**${n(v)}** ${g.currency}`);
const E = (description, kind = 'base') => ui.embed({ kind, description });
const reply = (ctx, embed, rows = []) => ui.sendEmbed(ctx.message, embed, { rows, extra: NOMENTION });
const say = (ctx, text, kind = 'base') => reply(ctx, E(text, kind));
const warn = (ctx, text) => say(ctx, `**${ctx.name}**, ${text}`, 'warning');
const bad = (ctx, text, hint) => say(ctx, `**${ctx.name}**, ${text}${hint ? `\n-# ${hint}` : ''}`, 'error');
const balLine = (row, g) => `-# your balance is ${money(row.wallet, g)}`;
const isAdmin = (m) => m.permissions.has(P.Administrator) || m.permissions.has(P.ManageGuild);
const memberIds = (ctx) => [...ctx.guild.members.cache.filter((m) => !m.user.bot).keys()];
const ts = (d) => Math.floor(d.getTime() / 1000);

async function member(message, token) {
    const direct = message.mentions.members?.first();
    if (direct && token && token.includes(direct.id)) return direct;
    const id = String(token || '').replace(/\D/g, '');
    return id.length >= 17 ? message.guild.members.fetch(id).catch(() => null) : null;
}

/** Wallet, bank and the pay-out of any interest that built up. */
async function me(ctx, userId = ctx.uid) {
    let row = await db.user(ctx.gid, userId);
    const premium = userId === ctx.uid ? ctx.premium : await prem.isUserPremium(userId);
    const days = Math.min(D.BANK.maxDays, Math.floor((Date.now() - new Date(row.bank_at).getTime()) / D.DAY));
    if (days >= 1) {
        const rate = premium ? D.BANK.premiumInterest : D.BANK.interest;
        const room = Math.max(0, row.bank_cap + (premium ? D.BANK.premiumCap : 0) - row.bank);
        const gain = row.bank > 0 ? Math.min(room, Math.floor(row.bank * (Math.pow(1 + rate, days) - 1))) : 0;
        const next = new Date(new Date(row.bank_at).getTime() + days * D.DAY);
        const hit = await require('../../database/pg').getOne(
            `UPDATE eco_user SET bank = bank + $5, bank_at = $4 WHERE guild_id = $1 AND user_id = $2 AND date_trunc('milliseconds', bank_at) = $3 RETURNING *`,
            [db.G, userId, new Date(row.bank_at), next, gain]);
        if (hit) row = { ...row, bank: row.bank + gain, bank_at: next };
    }
    return row;
}
const capOf = (row, premium) => row.bank_cap + (premium ? D.BANK.premiumCap : 0);

/** Starts the cooldown. Sends the "cooling down" line and returns false while it is still running. */
async function gate(ctx, cmd) {
    const ms = D.COOLDOWN[cmd] * (ctx.premium ? D.PREMIUM_CD : 1);
    const until = await db.claim(ctx.gid, ctx.uid, cmd, ms);
    if (!until) return true;
    await say(ctx, `**${ctx.name}**, you're cooling down.. try again <t:${ts(until)}:R> ${HEART}`, 'warning');
    return false;
}

const boosted = (ctx, v) => Math.floor(v * ctx.boost);

/* ── item lookup ───────────────────────────────────────────────────── */

const customKey = (gid, slot) => `s:${gid}:${slot}`;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9#]/g, '');

async function catalogue(ctx) {
    const out = D.SHOP.map((i) => ({ ...i, key: i.id, src: 'bot' }));
    if (await prem.isGuildPremium(ctx.gid)) {
        for (const r of await db.shopItems(ctx.gid)) {
            out.push({ key: customKey(ctx.gid, r.slot), id: `#${r.slot}`, slot: r.slot, name: r.name, price: r.price, desc: r.description, roleId: r.role_id, stock: r.stock, src: 'server', kind: r.role_id ? 'role' : 'item' });
        }
    }
    return out;
}
function match(list, query) {
    const q = norm(query);
    if (!q) return null;
    return list.find((i) => norm(i.id) === q || norm(i.name) === q)
        || list.find((i) => norm(i.name).startsWith(q) || norm(i.id).startsWith(q)) || null;
}
/** What a stored inventory key is: shop item, loot, or a server item (even a removed one). */
async function describe(ctx, key) {
    if (key.startsWith('s:')) {
        const [, gid, slot] = key.split(':');
        const row = await db.shopItem(gid, Number(slot));
        return { key, name: row?.name ?? 'Removed item', value: Math.floor((row?.price ?? 0) * D.SELL_RATE), src: 'server', slot: row ? row.slot : null };
    }
    const s = D.SHOP.find((i) => i.id === key);
    if (s) return { key, name: s.name, value: Math.floor(s.price * D.SELL_RATE), src: 'bot', kind: s.kind, id: s.id };
    const l = D.LOOT.find((i) => i.id === key);
    if (l) return { key, name: l.name, value: l.value, src: 'loot', id: l.id };
    return { key, name: key, value: 0, src: 'old' };
}
async function ownedMatch(ctx, query) {
    const inv = await db.inventory(ctx.gid, ctx.uid);
    const all = await Promise.all(inv.map(async (r) => ({ ...(await describe(ctx, r.item)), qty: r.qty, id: r.item.startsWith('s:') ? `#${r.item.split(':')[2]}` : r.item })));
    return { all, hit: match(all, query) };
}

/* ── the commands ──────────────────────────────────────────────────── */

const H = {};

H.balance = async (ctx, args) => {
    const target = args[0] ? await member(ctx.message, args[0]) : ctx.message.member;
    if (!target) return bad(ctx, 'I couldn\'t find that member.');
    if (target.user.bot) return bad(ctx, 'bots don\'t have a wallet.');
    const row = await me(ctx, target.id);
    const premium = target.id === ctx.uid ? ctx.premium : await prem.isUserPremium(target.id);
    const rank = await db.rankOf(memberIds(ctx), target.id);
    const j = D.job(row.job);
    const e = ui.embed({
        description: [
            `**${target.displayName}'s balance** ${HEART}`,
            `> ${pre('eco_wallet')}wallet ${money(row.wallet, ctx.g)}`,
            `> ${pre('eco_bank')}bank ${money(row.bank, ctx.g)} of ${n(capOf(row, premium))}`,
            `> net worth ${money(row.wallet + row.bank, ctx.g)}`,
            `-# ${pre('eco_job')}${j.name} · ${pre('eco_streak')}${row.streak} day streak · rank #${n(rank)}`,
        ].join('\n'),
        thumbnail: target.displayAvatarURL({ size: 128 }),
    });
    return reply(ctx, e);
};

H.daily = async (ctx) => {
    if (!(await gate(ctx, 'daily'))) return;
    const row = await me(ctx);
    const last = row.last_daily ? new Date(row.last_daily).getTime() : 0;
    const streak = last && Date.now() - last < 2 * D.DAY ? row.streak + 1 : 1;
    const base = D.REWARD.daily + D.REWARD.dailyStep * (Math.min(streak, D.REWARD.dailyMaxStreak) - 1);
    const amt = boosted(ctx, base);
    const after = await db.change(ctx.gid, ctx.uid, { wallet: amt, earn: amt });
    await db.patchUser(ctx.gid, ctx.uid, { streak, best_streak: Math.max(row.best_streak, streak), last_daily: new Date() });
    return reply(ctx, E([
        `**${ctx.name} claimed their daily** ${HEART}`,
        `> earned ${money(amt, ctx.g)}`,
        `-# ${pre('eco_streak')}streak is **${streak}** day${streak === 1 ? '' : 's'}${streak < D.REWARD.dailyMaxStreak ? ` · tomorrow pays ${n(boosted(ctx, base + D.REWARD.dailyStep))}` : ' · max bonus'}${ctx.premium ? ` · premium x${ctx.boost}` : ''}`,
        balLine(after, ctx.g),
    ].join('\n'), 'success'));
};

H.weekly = async (ctx) => {
    if (!(await gate(ctx, 'weekly'))) return;
    const amt = boosted(ctx, D.REWARD.weekly);
    const after = await db.change(ctx.gid, ctx.uid, { wallet: amt, earn: amt });
    return reply(ctx, E([`**${ctx.name} claimed their weekly** ${HEART}`, `> earned ${money(amt, ctx.g)}`, balLine(after, ctx.g)].join('\n'), 'success'));
};

H.work = async (ctx) => {
    if (!(await gate(ctx, 'work'))) return;
    const row = await me(ctx);
    const j = D.job(row.job);
    let pay = rand(j.min, j.max);
    const notes = [];
    if (await db.owned(ctx.gid, ctx.uid, 'laptop')) { pay = Math.floor(pay * 1.15); notes.push('laptop +15%'); }
    const roll = Math.random();
    if (roll < 0.1) { pay = Math.floor(pay * 1.5); notes.push('a customer tipped you'); }
    else if (roll > 0.92) { pay = Math.ceil(pay * 0.6); notes.push('it was a slow shift'); }
    pay = boosted(ctx, pay);
    const after = await db.change(ctx.gid, ctx.uid, { wallet: pay, earn: pay });
    const shifts = row.shifts + 1;
    await db.patchUser(ctx.gid, ctx.uid, { shifts });
    const next = D.JOBS.find((x) => x.shifts > row.shifts && x.shifts <= shifts);
    return reply(ctx, E([
        `**${ctx.name} worked a shift** as a **${j.name}** ${HEART}`,
        `> earned ${money(pay, ctx.g)}`,
        notes.length || ctx.premium ? `-# ${[...notes, ctx.premium ? `premium x${ctx.boost}` : null].filter(Boolean).join(' · ')}` : null,
        next ? `> you can now apply to be a **${next.name}** with \`job apply ${next.id}\`` : null,
        balLine(after, ctx.g),
    ].filter(Boolean).join('\n'), 'success'));
};

H.job = async (ctx, args) => {
    const sub = (args[0] || '').toLowerCase();
    const row = await me(ctx);
    if (sub === 'apply' || sub === 'promote') {
        const j = D.JOBS.find((x) => x.id === norm(args[1] || '') || norm(x.name) === norm(args.slice(1).join(' ')));
        if (!j) return bad(ctx, 'pick a job from the list.', 'See `job` for every job and what it needs.');
        if (j.id === row.job) return bad(ctx, `you already work as a **${j.name}**.`);
        if (row.shifts < j.shifts) return bad(ctx, `**${j.name}** needs **${j.shifts}** shifts, you have done **${row.shifts}**.`, 'Every `work` is one shift.');
        await db.patchUser(ctx.gid, ctx.uid, { job: j.id });
        return say(ctx, `**${ctx.name} is now a ${j.name}** ${HEART}\n> pays ${money(j.min, ctx.g)} to ${money(j.max, ctx.g)} per shift`, 'success');
    }
    if (sub === 'quit') {
        await db.patchUser(ctx.gid, ctx.uid, { job: 'cashier' });
        return say(ctx, `**${ctx.name} went back to being a Cashier.**\n-# your shifts are kept, so you can apply again any time.`);
    }
    const lines = D.JOBS.map((j) => {
        const mark = j.id === row.job ? '**(you)** ' : '';
        const lock = row.shifts >= j.shifts ? '' : ` · needs ${j.shifts} shifts`;
        return `> ${mark}**${j.name}** · ${n(j.min)} to ${n(j.max)}${lock}`;
    });
    return reply(ctx, E([`**jobs** ${HEART}`, ...lines, `-# you have done **${n(row.shifts)}** shift${row.shifts === 1 ? '' : 's'} · \`job apply <name>\` · \`job quit\``].join('\n')));
};

H.beg = async (ctx) => {
    if (!(await gate(ctx, 'beg'))) return;
    if (chance(0.18)) return say(ctx, `**${ctx.name} begged on the street** ${HEART}\n> nobody gave anything this time.`);
    const amt = boosted(ctx, rand(...D.REWARD.beg));
    const after = await db.change(ctx.gid, ctx.uid, { wallet: amt, earn: amt });
    return reply(ctx, E([`**${ctx.name} begged on the street** ${HEART}`, `> someone dropped ${money(amt, ctx.g)}`, balLine(after, ctx.g)].join('\n'), 'success'));
};

const cloverOn = (ctx) => db.flag(ctx.gid, ctx.uid, 'clover');

H.crime = async (ctx) => {
    if (!(await gate(ctx, 'crime'))) return;
    const odds = D.REWARD.crime.chance + ((await cloverOn(ctx)) ? 0.15 : 0);
    if (chance(odds)) {
        const amt = boosted(ctx, rand(...D.REWARD.crime.win));
        const after = await db.change(ctx.gid, ctx.uid, { wallet: amt, earn: amt });
        return reply(ctx, E([`**${ctx.name} pulled off a crime** ${HEART}`, `> got away with ${money(amt, ctx.g)}`, balLine(after, ctx.g)].join('\n'), 'success'));
    }
    const row = await db.user(ctx.gid, ctx.uid);
    const fine = Math.min(row.wallet, rand(...D.REWARD.crime.fine));
    const after = fine ? await db.change(ctx.gid, ctx.uid, { wallet: -fine }) : row;
    return reply(ctx, E([`**${ctx.name} got caught** ${HEART}`, `> paid a fine of ${money(fine, ctx.g)}`, balLine(after ?? row, ctx.g)].join('\n'), 'error'));
};

H.rob = async (ctx, args) => {
    const target = await member(ctx.message, args[0]);
    if (!target) return bad(ctx, 'mention who you want to rob.', 'Example: `rob @user`');
    if (target.id === ctx.uid) return bad(ctx, 'you can\'t rob yourself.');
    if (target.user.bot) return bad(ctx, 'bots have nothing to steal.');
    const mine = await me(ctx);
    const theirs = await db.user(ctx.gid, target.id);
    if (mine.wallet < D.REWARD.rob.minRobber) return bad(ctx, `you need at least ${money(D.REWARD.rob.minRobber, ctx.g)} in your wallet to risk it.`);
    if (theirs.wallet < D.REWARD.rob.minVictim) return bad(ctx, `**${target.displayName}** has less than ${money(D.REWARD.rob.minVictim, ctx.g)} in their wallet, not worth it.`);
    if (await db.flag(ctx.gid, target.id, 'padlock')) return bad(ctx, `**${target.displayName}** has a padlock on their wallet.`);
    if (!(await gate(ctx, 'rob'))) return;

    const odds = D.REWARD.rob.chance + ((await cloverOn(ctx)) ? 0.15 : 0);
    if (chance(odds)) {
        const take = Math.min(D.REWARD.rob.cap, Math.max(1, Math.floor(theirs.wallet * (D.REWARD.rob.take[0] + Math.random() * (D.REWARD.rob.take[1] - D.REWARD.rob.take[0])))));
        if (!(await db.transfer(ctx.gid, target.id, ctx.uid, take))) return bad(ctx, 'they spent their money before you got to it.');
        return say(ctx, `**${ctx.name} robbed ${target.displayName}** ${HEART}\n> stole ${money(take, ctx.g)}\n-# the rest of their money is safe in the bank`, 'success');
    }
    const fine = Math.min(mine.wallet, rand(...D.REWARD.rob.fine));
    if (fine) await db.transfer(ctx.gid, ctx.uid, target.id, fine);
    return say(ctx, `**${ctx.name} got caught robbing ${target.displayName}** ${HEART}\n> paid them ${money(fine, ctx.g)}`, 'error');
};

const needTool = (ctx, id, verb) => bad(ctx, `you need a **${D.SHOP.find((i) => i.id === id).name.toLowerCase()}** to ${verb}.`, 'Buy one in the `shop`.');

async function gather(ctx, tool, table, verb, line) {
    if (!(await db.owned(ctx.gid, ctx.uid, tool))) return needTool(ctx, tool, verb);
    if (!(await gate(ctx, verb))) return;
    const item = D.pick(table);
    await db.addItem(ctx.gid, ctx.uid, item.id, 1);
    let broke = false;
    if (chance(D.BREAK[tool]) && (await db.takeItem(ctx.gid, ctx.uid, tool, 1))) broke = true;
    return reply(ctx, E([
        `**${ctx.name} ${line}** ${HEART}`,
        `> found **${item.name}** worth ${money(item.value, ctx.g)}`,
        broke ? `-# your ${D.SHOP.find((i) => i.id === tool).name.toLowerCase()} broke, buy a new one in the \`shop\`` : '-# sell it with `sell ' + item.id + '`',
    ].join('\n'), 'success'));
}
H.fish = (ctx) => gather(ctx, 'rod', D.FISH, 'fish', 'went fishing');
H.mine = (ctx) => gather(ctx, 'pickaxe', D.ORE, 'mine', 'went mining');

/* bank */

H.deposit = async (ctx, args) => {
    const row = await me(ctx);
    const room = Math.max(0, capOf(row, ctx.premium) - row.bank);
    let amt = D.amount(args[0], Math.min(row.wallet, room));
    if (amt === null || amt < 1) return bad(ctx, 'tell me how much to deposit.', 'Example: `deposit 200` or `deposit all`');
    if (amt > row.wallet) return bad(ctx, `you only have ${money(row.wallet, ctx.g)} in your wallet.`);
    if (room < 1) return bad(ctx, 'your bank is full.', 'Buy a **bank note** in the shop to raise the limit.');
    if (amt > room) amt = room;
    if (row.bank === 0) await db.patchUser(ctx.gid, ctx.uid, { bank_at: new Date() });
    const after = await db.change(ctx.gid, ctx.uid, { wallet: -amt, bank: amt });
    if (!after) return bad(ctx, 'you don\'t have that much anymore.');
    return reply(ctx, E([`**${ctx.name} deposited** ${HEART}`, `> moved ${money(amt, ctx.g)} to the bank`, `-# bank ${money(after.bank, ctx.g)} / ${n(capOf(after, ctx.premium))} · wallet ${money(after.wallet, ctx.g)}`].join('\n'), 'success'));
};

H.withdraw = async (ctx, args) => {
    const row = await me(ctx);
    const amt = D.amount(args[0], row.bank);
    if (amt === null || amt < 1) return bad(ctx, 'tell me how much to withdraw.', 'Example: `withdraw 200` or `withdraw all`');
    if (amt > row.bank) return bad(ctx, `you only have ${money(row.bank, ctx.g)} in the bank.`);
    const after = await db.change(ctx.gid, ctx.uid, { wallet: amt, bank: -amt });
    if (!after) return bad(ctx, 'you don\'t have that much anymore.');
    return reply(ctx, E([`**${ctx.name} withdrew** ${HEART}`, `> took ${money(amt, ctx.g)} out of the bank`, `-# bank ${money(after.bank, ctx.g)} · wallet ${money(after.wallet, ctx.g)}`].join('\n'), 'success'));
};

H.pay = async (ctx, args) => {
    const target = await member(ctx.message, args[0]);
    if (!target) return bad(ctx, 'mention who you want to pay.', 'Example: `pay @user 50`');
    if (target.id === ctx.uid) return bad(ctx, 'you can\'t pay yourself.');
    if (target.user.bot) return bad(ctx, 'bots can\'t be paid.');
    const row = await me(ctx);
    const amt = D.amount(args[1], row.wallet);
    if (amt === null || amt < 1) return bad(ctx, 'tell me how much to send.', 'Example: `pay @user 50`');
    if (amt > row.wallet) return bad(ctx, `you only have ${money(row.wallet, ctx.g)} in your wallet.`);
    if (!(await db.transfer(ctx.gid, ctx.uid, target.id, amt))) return bad(ctx, 'you don\'t have that much anymore.');
    return say(ctx, `**${ctx.name} paid ${target.displayName}** ${HEART}\n> sent ${money(amt, ctx.g)}\n-# your wallet is ${money(row.wallet - amt, ctx.g)}`, 'success');
};

/* games */

async function bet(ctx, token, cmd) {
    const row = await me(ctx);
    const cap = Math.min(ctx.g.max_bet, row.wallet);
    const amt = D.amount(token, cap);
    if (amt === null || amt < 1) { await bad(ctx, 'tell me how much to bet.', `Example: \`${cmd} 50\` or \`${cmd} all\``); return null; }
    if (amt < D.GAMBLE.minBet) { await bad(ctx, `the smallest bet is ${money(D.GAMBLE.minBet, ctx.g)}.`); return null; }
    if (amt > ctx.g.max_bet) { await bad(ctx, `the biggest bet here is ${money(ctx.g.max_bet, ctx.g)}.`); return null; }
    if (amt > row.wallet) { await bad(ctx, `you only have ${money(row.wallet, ctx.g)} in your wallet.`); return null; }
    if (!(await gate(ctx, cmd))) return null;
    return amt;
}
/** Settle a bet: delta is what you gain (positive) or lose (negative). */
const settle = (ctx, delta) => db.change(ctx.gid, ctx.uid, { wallet: delta, earn: Math.max(0, delta) });

H.gamble = async (ctx, args) => {
    const amt = await bet(ctx, args[0], 'gamble');
    if (amt === null) return;
    const r = Math.random();
    const jackpot = r < D.GAMBLE.jackpotChance;
    const win = jackpot || r < D.GAMBLE.jackpotChance + D.GAMBLE.chance;
    const delta = jackpot ? amt * D.GAMBLE.jackpot : win ? amt : -amt;
    const after = await settle(ctx, delta);
    if (!after) return bad(ctx, 'you don\'t have that much anymore.');
    return reply(ctx, E([
        `**${ctx.name} ${jackpot ? 'hit the jackpot' : win ? 'won the gamble' : 'lost the gamble'}** ${HEART}`,
        `> ${win ? 'won' : 'lost'} ${money(Math.abs(delta), ctx.g)}`,
        balLine(after, ctx.g),
    ].join('\n'), win ? 'success' : 'error'));
};

H.coinflip = async (ctx, args) => {
    const side = ['heads', 'tails', 'h', 't'].includes((args[0] || '').toLowerCase()) ? args[0].toLowerCase()[0] : null;
    if (!side) return bad(ctx, 'pick heads or tails and a bet.', 'Example: `coinflip heads 50`');
    const amt = await bet(ctx, args[1], 'coinflip');
    if (amt === null) return;
    const win = chance(D.GAMBLE.flip);
    const landed = win ? side : side === 'h' ? 't' : 'h';
    const after = await settle(ctx, win ? amt : -amt);
    if (!after) return bad(ctx, 'you don\'t have that much anymore.');
    return reply(ctx, E([
        `**${ctx.name} flipped a coin** ${HEART}`,
        `> it landed on **${landed === 'h' ? 'heads' : 'tails'}**, you ${win ? 'won' : 'lost'} ${money(amt, ctx.g)}`,
        balLine(after, ctx.g),
    ].join('\n'), win ? 'success' : 'error'));
};

const REELS = [
    { id: 'cherry', w: 30, x: 3 }, { id: 'lemon', w: 28, x: 4 }, { id: 'bell', w: 20, x: 6 },
    { id: 'clover', w: 14, x: 10 }, { id: 'seven', w: 8, x: 20 },
];
H.slots = async (ctx, args) => {
    const amt = await bet(ctx, args[0], 'slots');
    if (amt === null) return;
    const spin = [D.pick(REELS), D.pick(REELS), D.pick(REELS)];
    const ids = spin.map((s) => s.id);
    const triple = ids.every((x) => x === ids[0]);
    const pair = !triple && new Set(ids).size === 2;
    const total = triple ? Math.floor(amt * spin[0].x) : pair ? Math.floor(amt * 1.2) : 0;
    const delta = total - amt;
    const after = await settle(ctx, delta);
    if (!after) return bad(ctx, 'you don\'t have that much anymore.');
    const shown = spin.map((s) => icon(`eco_slot_${s.id}`, s.id)).join(' | ');
    return reply(ctx, E([
        `**${ctx.name} spun the slots** ${HEART}`,
        `> ${shown}`,
        `> ${triple ? `three of a kind, won ${money(delta, ctx.g)}` : pair ? `a pair, won ${money(Math.max(0, delta), ctx.g)}` : `no match, lost ${money(amt, ctx.g)}`}`,
        balLine(after, ctx.g),
    ].join('\n'), delta > 0 ? 'success' : 'error'));
};

/* shop */

H.shop = async (ctx, args) => {
    const sub = (args[0] || '').toLowerCase();
    if (['add', 'remove', 'delete', 'edit'].includes(sub)) return shopAdmin(ctx, sub, args.slice(1));
    const premiumServer = await prem.isGuildPremium(ctx.gid);
    const list = await catalogue(ctx);
    const base = list.filter((i) => i.src === 'bot').map((i) => `> **${i.name}** · ${money(i.price, ctx.g)}\n> -# ${i.desc}`);
    const custom = list.filter((i) => i.src === 'server').map((i) => `> **${i.name}** \`#${i.slot}\` · ${money(i.price, ctx.g)}${i.stock !== null && i.stock !== undefined ? ` · ${i.stock} left` : ''}${i.roleId ? ` · gives <@&${i.roleId}>` : ''}${i.desc ? `\n> -# ${i.desc}` : ''}`);
    const e = E([
        `**${ctx.guild.name}'s shop** ${HEART}`,
        ...base,
        custom.length ? `\n**server shop**` : null,
        ...custom,
        `-# \`buy <item> [amount]\` · \`sell <item>\` · \`use <item>\`${premiumServer && isAdmin(ctx.message.member) ? ' · `shop add` to add your own' : ''}`,
    ].filter((x) => x !== null).join('\n'));
    await reply(ctx, e);
    if (!premiumServer && isAdmin(ctx.message.member)) {
        views().nudge(ctx.message, { plan: 'server', topic: 'ecoshop', line: 'Add your own roles and items to this shop, with prices and stock, using **Server Premium**.' });
    }
};

async function shopAdmin(ctx, sub, args) {
    if (!isAdmin(ctx.message.member)) return bad(ctx, 'you need the **Manage Server** permission to change the shop.');
    if (!(await prem.isGuildPremium(ctx.gid))) {
        await bad(ctx, 'the server shop is only for **premium servers**.', 'Every server can still use the bot\'s own shop.');
        return views().nudge(ctx.message, { plan: 'server', topic: 'ecoshop', line: 'Add your own roles and items to the shop with **Server Premium**.' });
    }
    if (sub === 'add') {
        // shop add role @Role <price> [stock]   |   shop add item <price> <name> [| description]
        const kind = (args[0] || '').toLowerCase();
        const items = await db.shopItems(ctx.gid);
        if (items.length >= D.SHOP_LIMIT) return bad(ctx, `the server shop is full (${D.SHOP_LIMIT} items).`);
        if (kind === 'role') {
            const role = ctx.message.mentions.roles.first() || ctx.guild.roles.cache.get((args[1] || '').replace(/\D/g, ''));
            const price = D.amount(args[2]);
            const stock = args[3] ? D.amount(args[3]) : null;
            if (!role || role.id === ctx.guild.id || role.managed) return bad(ctx, 'mention a normal role to sell.', 'Example: `shop add role @VIP 2500` or `shop add role @VIP 2500 10` for 10 in stock');
            if (!price || price < 1) return bad(ctx, 'give the role a price.', 'Example: `shop add role @VIP 2500`');
            if (role.position >= ctx.guild.members.me.roles.highest.position) return bad(ctx, 'that role is above my highest role, so I couldn\'t give it out.', 'Move my role above it first.');
            const slot = await db.shopAdd(ctx.gid, { name: role.name.slice(0, 40), price, roleId: role.id, stock: stock || null, description: 'A role for your profile' });
            return say(ctx, `**${ctx.name} added a role to the shop** ${HEART}\n> **${role.name}** \`#${slot}\` for ${money(price, ctx.g)}${stock ? ` · ${stock} in stock` : ''}`, 'success');
        }
        if (kind === 'item') {
            const price = D.amount(args[1]);
            const rest = args.slice(2).join(' ').split('|');
            const name = (rest[0] || '').trim().slice(0, 40);
            if (!price || price < 1 || !name) return bad(ctx, 'give the item a price and a name.', 'Example: `shop add item 500 Movie night ticket | Pick the movie`');
            const slot = await db.shopAdd(ctx.gid, { name, price, description: (rest[1] || '').trim().slice(0, 100) || null });
            return say(ctx, `**${ctx.name} added an item to the shop** ${HEART}\n> **${name}** \`#${slot}\` for ${money(price, ctx.g)}\n-# members redeem it with \`use\` and then ask staff`, 'success');
        }
        return bad(ctx, 'say what to add: a `role` or an `item`.', 'Example: `shop add role @VIP 2500`');
    }
    const slot = Number((args[0] || '').replace('#', ''));
    const row = Number.isInteger(slot) && slot > 0 ? await db.shopItem(ctx.gid, slot) : null;
    if (!row) return bad(ctx, 'I couldn\'t find that item.', 'Use the number shown next to it, like `shop remove 2`');
    if (sub === 'remove' || sub === 'delete') {
        await db.shopRemove(ctx.gid, slot);
        return say(ctx, `**${ctx.name} removed an item** ${HEART}\n> **${row.name}** is gone from the shop\n-# people who already bought it keep it`, 'success');
    }
    const field = (args[1] || '').toLowerCase();
    const value = args.slice(2).join(' ');
    if (field === 'price') {
        const v = D.amount(value); if (!v || v < 1) return bad(ctx, 'that isn\'t a valid price.');
        await db.shopEdit(ctx.gid, slot, { price: v });
    } else if (field === 'stock') {
        const none = ['none', 'unlimited', 'off', '0'].includes(value.toLowerCase());
        const v = none ? null : D.amount(value); if (!none && (v === null || v < 1)) return bad(ctx, 'give a number, or `unlimited`.');
        await db.shopEdit(ctx.gid, slot, { stock: v });
    } else if (field === 'name') {
        if (!value) return bad(ctx, 'give it a name.');
        await db.shopEdit(ctx.gid, slot, { name: value.slice(0, 40) });
    } else if (field === 'description' || field === 'desc') {
        await db.shopEdit(ctx.gid, slot, { description: value.slice(0, 100) || null });
    } else return bad(ctx, 'say what to change: `price`, `stock`, `name` or `description`.', 'Example: `shop edit 2 price 3000`');
    return say(ctx, `**${ctx.name} updated an item** ${HEART}\n> **${row.name}** · ${field} changed`, 'success');
}

H.buy = async (ctx, args) => {
    if (!args.length) return bad(ctx, 'tell me what to buy.', 'Example: `buy rod` or `buy padlock 2`');
    let qty = 1, words = args;
    const lastN = args.length > 1 ? D.amount(args[args.length - 1]) : null;
    if (lastN !== null && lastN >= 1 && !/^#/.test(args[args.length - 1])) { qty = Math.min(lastN, 99); words = args.slice(0, -1); }
    const list = await catalogue(ctx);
    const item = match(list, words.join(' '));
    if (!item) return bad(ctx, 'that item isn\'t in the shop.', 'Check the `shop` for names.');
    if (item.src === 'server' && item.roleId) qty = 1;
    const total = item.price * qty;
    const row = await me(ctx);
    if (row.wallet < total) return bad(ctx, `that costs ${money(total, ctx.g)} and you have ${money(row.wallet, ctx.g)} in your wallet.`);

    if (item.src === 'server') {
        if (item.roleId) {
            const role = ctx.guild.roles.cache.get(item.roleId);
            if (!role) return bad(ctx, 'that role no longer exists, ask an admin to remove it from the shop.');
            if (ctx.message.member.roles.cache.has(role.id)) return bad(ctx, 'you already have that role.');
            if (role.position >= ctx.guild.members.me.roles.highest.position) return bad(ctx, 'I can\'t give out that role right now.', 'An admin needs to move my role above it.');
        }
        if (!(await db.shopTake(ctx.gid, item.slot, qty))) return bad(ctx, 'that item is sold out.');
        const paid = await db.change(ctx.gid, ctx.uid, { wallet: -total });
        if (!paid) { await db.shopGive(ctx.gid, item.slot, qty); return bad(ctx, 'you don\'t have enough anymore.'); }
        if (item.roleId) {
            try { await ctx.message.member.roles.add(item.roleId, 'economy shop'); }
            catch { await db.change(ctx.gid, ctx.uid, { wallet: total }); await db.shopGive(ctx.gid, item.slot, qty); return bad(ctx, 'I couldn\'t give you that role, you were not charged.'); }
        } else await db.addItem(ctx.gid, ctx.uid, item.key, qty);
        return reply(ctx, E([`**${ctx.name} bought ${item.name}** ${HEART}`, `> paid ${money(total, ctx.g)}${item.roleId ? ' and got the role' : ''}`, balLine(paid, ctx.g)].join('\n'), 'success'));
    }

    const paid = await db.change(ctx.gid, ctx.uid, { wallet: -total });
    if (!paid) return bad(ctx, 'you don\'t have enough anymore.');
    await db.addItem(ctx.gid, ctx.uid, item.key, qty);
    return reply(ctx, E([`**${ctx.name} bought ${qty > 1 ? `${qty}x ` : ''}${item.name}** ${HEART}`, `> paid ${money(total, ctx.g)}`, balLine(paid, ctx.g)].join('\n'), 'success'));
};

H.inventory = async (ctx, args) => {
    const target = args[0] ? await member(ctx.message, args[0]) : ctx.message.member;
    if (!target) return bad(ctx, 'I couldn\'t find that member.');
    const inv = await db.inventory(ctx.gid, target.id);
    if (!inv.length) return say(ctx, `**${target.displayName}'s inventory** ${HEART}\n> nothing here yet.\n-# buy tools in the \`shop\`, then \`fish\` or \`mine\``);
    const lines = [];
    let worth = 0;
    for (const r of inv.slice(0, 25)) {
        const d = await describe(ctx, r.item);
        worth += d.value * r.qty;
        lines.push(`> **${d.name}** x${n(r.qty)}${d.value ? ` · ${n(d.value)} each` : ''}`);
    }
    return reply(ctx, E([`**${target.displayName}'s inventory** ${HEART}`, ...lines, `-# worth about ${n(worth)} ${ctx.g.currency} · \`sell <item> [amount|all]\` · \`use <item>\``].join('\n')));
};

H.sell = async (ctx, args) => {
    if (!args.length) return bad(ctx, 'tell me what to sell.', 'Example: `sell trout all`');
    let words = args, qtyTok = '1';
    if (args.length > 1 && (D.amount(args[args.length - 1], 1) !== null)) { qtyTok = args[args.length - 1]; words = args.slice(0, -1); }
    const { hit } = await ownedMatch(ctx, words.join(' '));
    if (!hit) return bad(ctx, 'you don\'t have that item.', 'Check your `inventory`.');
    const qty = qtyTok === 'all' ? hit.qty : D.amount(qtyTok, hit.qty);
    if (!qty || qty < 1) return bad(ctx, 'give a valid amount.');
    if (qty > hit.qty) return bad(ctx, `you only have **${hit.qty}** of that.`);
    if (hit.value < 1) return bad(ctx, 'that item can\'t be sold.');
    if (!(await db.takeItem(ctx.gid, ctx.uid, hit.key, qty))) return bad(ctx, 'you don\'t have that many anymore.');
    const total = hit.value * qty;
    const after = await db.change(ctx.gid, ctx.uid, { wallet: total, earn: total });
    return reply(ctx, E([`**${ctx.name} sold ${qty > 1 ? `${qty}x ` : ''}${hit.name}** ${HEART}`, `> got ${money(total, ctx.g)}`, balLine(after, ctx.g)].join('\n'), 'success'));
};

H.use = async (ctx, args) => {
    if (!args.length) return bad(ctx, 'tell me what to use.', 'Example: `use padlock`');
    const { hit } = await ownedMatch(ctx, args.join(' '));
    if (!hit) return bad(ctx, 'you don\'t have that item.', 'Check your `inventory`.');
    const take = () => db.takeItem(ctx.gid, ctx.uid, hit.key, 1);
    if (hit.src === 'server') {
        if (!(await take())) return bad(ctx, 'you don\'t have that item anymore.');
        return say(ctx, `**${ctx.name} used ${hit.name}** ${HEART}\n> show this message to the staff to redeem it`, 'success');
    }
    switch (hit.id) {
        case 'padlock':
            if (!(await take())) return bad(ctx, 'you don\'t have that item anymore.');
            await db.setFlag(ctx.gid, ctx.uid, 'padlock', 12 * D.HOUR);
            return say(ctx, `**${ctx.name} locked their wallet** ${HEART}\n> nobody can rob you for the next 12 hours`, 'success');
        case 'energy':
            if (!(await take())) return bad(ctx, 'you don\'t have that item anymore.');
            await db.clearCd(ctx.gid, ctx.uid, 'work');
            return say(ctx, `**${ctx.name} drank an energy drink** ${HEART}\n> you can \`work\` again right now`, 'success');
        case 'clover':
            if (!(await take())) return bad(ctx, 'you don\'t have that item anymore.');
            await db.setFlag(ctx.gid, ctx.uid, 'clover', 6 * D.HOUR);
            return say(ctx, `**${ctx.name} is feeling lucky** ${HEART}\n> +15% odds on \`crime\` and \`rob\` for 6 hours`, 'success');
        case 'banknote': {
            if (!(await take())) return bad(ctx, 'you don\'t have that item anymore.');
            const row = await db.user(ctx.gid, ctx.uid);
            const after = await db.patchUser(ctx.gid, ctx.uid, { bank_cap: row.bank_cap + 2500 });
            return say(ctx, `**${ctx.name} upgraded their bank** ${HEART}\n> the limit is now **${n(capOf(after, ctx.premium))}**`, 'success');
        }
        default:
            return bad(ctx, `**${hit.name}** can't be used.`, hit.src === 'loot' ? 'Sell it with `sell`.' : 'Tools work on their own while you own them.');
    }
};

/* market */

const sign = (v) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(1)}%`;
const arrow = (v) => (v >= 0 ? pre('eco_up') : pre('eco_down'));

H.market = async (ctx) => {
    const lines = D.ASSETS.map((a) => {
        const ch = D.change24(a);
        return `> ${arrow(ch)}**${a.name}** \`${a.id}\` · ${money(D.price(a), ctx.g)} · ${sign(ch)} today`;
    });
    return reply(ctx, E([`**the market** ${HEART}`, ...lines, `-# prices change every hour · \`invest buy <asset> <shares>\` · \`invest sell <asset> <shares|all>\` · fee ${D.TRADE_FEE * 100}%`].join('\n')));
};

H.invest = async (ctx, args) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'portfolio' || sub === 'list') return H.portfolio(ctx, args.slice(1));
    if (!['buy', 'sell'].includes(sub)) return bad(ctx, 'say buy or sell.', 'Example: `invest buy grace 3` · see `market` for prices');
    const a = D.asset(args[1]);
    if (!a) return bad(ctx, 'that asset doesn\'t exist.', 'See `market` for the list.');
    const price = D.price(a);
    if (sub === 'buy') {
        const row = await me(ctx);
        const maxShares = Math.floor(row.wallet / (price * (1 + D.TRADE_FEE)));
        const qty = args[2] === 'all' ? maxShares : D.amount(args[2]);
        if (!qty || qty < 1) return bad(ctx, 'tell me how many shares.', 'Example: `invest buy grace 3`');
        const cost = Math.ceil(price * qty * (1 + D.TRADE_FEE));
        if (cost > row.wallet) return bad(ctx, `${qty} share${qty > 1 ? 's' : ''} of **${a.name}** cost ${money(cost, ctx.g)} with the fee.`);
        const paid = await db.change(ctx.gid, ctx.uid, { wallet: -cost });
        if (!paid) return bad(ctx, 'you don\'t have enough anymore.');
        await db.addHolding(ctx.gid, ctx.uid, a.id, qty, cost);
        return reply(ctx, E([`**${ctx.name} bought shares** ${HEART}`, `> ${qty}x **${a.name}** at ${money(price, ctx.g)} · paid ${money(cost, ctx.g)}`, balLine(paid, ctx.g)].join('\n'), 'success'));
    }
    const held = (await db.holdings(ctx.gid, ctx.uid)).find((h) => h.asset === a.id);
    if (!held) return bad(ctx, `you don't own any **${a.name}**.`);
    const qty = args[2] === 'all' ? held.qty : D.amount(args[2]);
    if (!qty || qty < 1) return bad(ctx, 'tell me how many shares.', 'Example: `invest sell grace 3` or `all`');
    if (qty > held.qty) return bad(ctx, `you only own **${held.qty}**.`);
    const basis = Math.floor((held.spent * qty) / held.qty);
    const gross = price * qty;
    const proceeds = Math.floor(gross * (1 - D.TRADE_FEE));
    if (!(await db.takeHolding(ctx.gid, ctx.uid, a.id, qty))) return bad(ctx, 'you don\'t own that many anymore.');
    const after = await db.change(ctx.gid, ctx.uid, { wallet: proceeds, earn: Math.max(0, proceeds - basis) });
    const pl = proceeds - basis;
    return reply(ctx, E([`**${ctx.name} sold shares** ${HEART}`, `> ${qty}x **${a.name}** at ${money(price, ctx.g)} · got ${money(proceeds, ctx.g)}`, `-# ${pl >= 0 ? 'profit' : 'loss'} of ${n(Math.abs(pl))} ${ctx.g.currency} after fees`, balLine(after, ctx.g)].join('\n'), pl >= 0 ? 'success' : 'error'));
};

H.portfolio = async (ctx, args) => {
    const target = args?.[0] ? await member(ctx.message, args[0]) : ctx.message.member;
    if (!target) return bad(ctx, 'I couldn\'t find that member.');
    const held = await db.holdings(ctx.gid, target.id);
    if (!held.length) return say(ctx, `**${target.displayName}'s portfolio** ${HEART}\n> no shares yet.\n-# see the \`market\` and \`invest buy\``);
    let value = 0, spent = 0;
    const lines = held.map((h) => {
        const a = D.asset(h.asset); const v = D.price(a) * h.qty; value += v; spent += h.spent;
        const pl = ((v - h.spent) / Math.max(1, h.spent)) * 100;
        return `> ${arrow(pl)}**${a.name}** x${h.qty} · ${money(v, ctx.g)} · ${sign(pl)}`;
    });
    return reply(ctx, E([`**${target.displayName}'s portfolio** ${HEART}`, ...lines, `-# worth ${n(value)} · paid ${n(spent)} ${ctx.g.currency}`].join('\n')));
};

/* leaderboard */

H.richest = async (ctx, args) => {
    const ids = memberIds(ctx);
    const total = await db.countUsers(ids);
    const pages = Math.max(1, Math.ceil(total / 10));
    const page = Math.min(pages, Math.max(1, parseInt(args[0], 10) || 1));
    const rows = await db.top(ids, 10, (page - 1) * 10);
    if (!rows.length) return say(ctx, `**the richest** ${HEART}\n> nobody has any money yet.`);
    const lines = rows.map((r, i) => {
        const rank = (page - 1) * 10 + i + 1;
        const m = ctx.guild.members.cache.get(r.user_id);
        return `> \`${String(rank).padStart(2, ' ')}\` **${m ? m.displayName : `<@${r.user_id}>`}** · ${money(Number(r.total), ctx.g)}`;
    });
    const mine = await db.rankOf(ids, ctx.uid);
    return reply(ctx, E([`**the richest in ${ctx.guild.name}** ${HEART}`, ...lines, `-# page ${page}/${pages} · you are #${n(mine)}`].join('\n')));
};

/* admin */

const ADMIN_HELP = [
    '`economy enable` · `economy disable`',
    '`economy currency <name>` · `economy maxbet <amount>`',
    '`economy drops <on|off> [#channel]`',
];

H.economy = async (ctx, args) => {
    const sub = (args[0] || '').toLowerCase();
    const admin = isAdmin(ctx.message.member);
    const owner = ctx.uid === require('../../settings').OWNER_ID;
    if (['give', 'add', 'take', 'remove', 'reset', 'resetall'].includes(sub)) {
        if (!owner) return bad(ctx, 'only the bot owner can change balances.', 'Money is shared across every server, so a server admin can\'t edit it.');
    } else if (sub && !admin) return bad(ctx, 'you need the **Manage Server** permission for that.');
    const g = ctx.g;

    if (sub === 'enable' || sub === 'on') {
        await db.setGuild(ctx.gid, { enabled: true });
        return say(ctx, `**${ctx.name} turned the economy on** ${HEART}\n> members can now use \`daily\`, \`work\`, \`balance\`, \`shop\` and more\n-# use \`economy\` to change settings`, 'success');
    }
    if (sub === 'disable' || sub === 'off') {
        await db.setGuild(ctx.gid, { enabled: false });
        return say(ctx, `**${ctx.name} turned the economy off** ${HEART}\n-# balances are kept, they come back when you turn it on again`);
    }
    if (sub === 'currency') {
        const name = args.slice(1).join(' ').trim().slice(0, 20);
        if (!name) return bad(ctx, 'give the currency a name.', 'Example: `economy currency gems`');
        await db.setGuild(ctx.gid, { currency: name });
        return say(ctx, `**${ctx.name} renamed the currency** ${HEART}\n> it is now called **${name}**\n-# shown after amounts until the coin emoji is set`, 'success');
    }
    if (sub === 'maxbet') {
        const v = D.amount(args[1]);
        if (!v || v < D.GAMBLE.minBet) return bad(ctx, `the biggest bet must be at least ${D.GAMBLE.minBet}.`, 'Example: `economy maxbet 1000`');
        await db.setGuild(ctx.gid, { max_bet: v });
        return say(ctx, `**${ctx.name} changed the bet limit** ${HEART}\n> the biggest bet is now ${money(v, g)}`, 'success');
    }
    if (sub === 'drops') {
        const on = (args[1] || '').toLowerCase();
        if (!['on', 'off'].includes(on)) return bad(ctx, 'say on or off.', 'Example: `economy drops on #general`');
        const ch = ctx.message.mentions.channels.first();
        await db.setGuild(ctx.gid, { drops: on === 'on', ...(ch ? { drop_channel: ch.id } : on === 'off' ? {} : {}) });
        return say(ctx, `**${ctx.name} turned chat drops ${on}** ${HEART}\n> ${on === 'on' ? `a purse drops now and then ${ch ? `in ${ch}` : g.drop_channel ? `in <#${g.drop_channel}>` : 'in busy channels'}, first to grab it keeps it` : 'no more purses will drop'}`, 'success');
    }
    if (sub === 'give' || sub === 'add' || sub === 'take' || sub === 'remove') {
        const target = await member(ctx.message, args[1]);
        const v = D.amount(args[2]);
        if (!target || target.user.bot) return bad(ctx, 'mention a member.', `Example: \`economy ${sub} @user 100\``);
        if (!v || v < 1) return bad(ctx, 'give an amount.');
        const giving = sub === 'give' || sub === 'add';
        const row = await db.user(ctx.gid, target.id);
        const take = Math.min(v, row.wallet);
        const after = await db.change(ctx.gid, target.id, { wallet: giving ? v : -take });
        return say(ctx, `**${ctx.name} ${giving ? 'gave money to' : 'took money from'} ${target.displayName}** ${HEART}\n> ${giving ? 'added' : 'removed'} ${money(giving ? v : take, g)}\n-# their wallet is ${money(after?.wallet ?? row.wallet, g)}`, 'success');
    }
    if (sub === 'reset') {
        const target = await member(ctx.message, args[1]);
        if (!target) return bad(ctx, 'mention a member.', 'Example: `economy reset @user`');
        await db.wipeUser(ctx.gid, target.id);
        return say(ctx, `**${ctx.name} reset ${target.displayName}** ${HEART}\n> money, items and stats are cleared everywhere`, 'success');
    }
    if (sub === 'resetall') {
        return bad(ctx, 'wiping everyone isn\'t supported because money is shared across servers.', 'Use `economy reset @user` for one person.');
    }

    const premiumServer = await prem.isGuildPremium(ctx.gid);
    const items = premiumServer ? (await db.shopItems(ctx.gid)).length : 0;
    return reply(ctx, E([
        `**economy settings** ${HEART}`,
        `> status · ${g.enabled ? 'on' : 'off'}`,
        `> currency · ${g.currency}`,
        `> biggest bet · ${n(g.max_bet)}`,
        `> chat drops · ${g.drops ? `on${g.drop_channel ? ` in <#${g.drop_channel}>` : ''}` : 'off'}`,
        `> server shop · ${premiumServer ? `${items}/${D.SHOP_LIMIT} items` : 'premium servers only'}`,
        admin ? `\n**admin commands**\n${ADMIN_HELP.map((l) => `- ${l}`).join('\n')}` : null,
        !g.enabled ? '\n-# the economy is off here, an admin can run `economy enable`' : null,
    ].filter(Boolean).join('\n')));
};

/* ── command wrappers ──────────────────────────────────────────────── */

const META = {
    balance:   { aliases: ['bal', 'cash', 'wallet'], description: 'See your wallet, bank and rank', usage: 'balance [user]' },
    daily:     { aliases: [], description: 'Claim your daily money, it grows with your streak', usage: 'daily' },
    weekly:    { aliases: [], description: 'Claim your weekly money', usage: 'weekly' },
    work:      { aliases: ['shift'], description: 'Work a shift at your job', usage: 'work' },
    job:       { aliases: ['jobs'], description: 'See jobs, apply for a better one or quit', usage: 'job [apply <name>|quit]' },
    beg:       { aliases: [], description: 'Beg for a few coins', usage: 'beg' },
    crime:     { aliases: [], description: 'Risk a fine for a bigger payout', usage: 'crime' },
    rob:       { aliases: [], description: 'Try to rob someone\'s wallet', usage: 'rob <user>' },
    fish:      { aliases: ['fishing'], description: 'Catch fish to sell (needs a fishing rod)', usage: 'fish' },
    mine:      { aliases: ['mining'], description: 'Dig for ore to sell (needs a pickaxe)', usage: 'mine' },
    deposit:   { aliases: ['dep'], description: 'Put money in the bank where it is safe and earns interest', usage: 'deposit <amount|all>' },
    withdraw:  { aliases: ['wd'], description: 'Take money out of the bank', usage: 'withdraw <amount|all>' },
    pay:       { aliases: ['send'], description: 'Send money to someone', usage: 'pay <user> <amount>' },
    gamble:    { aliases: ['bet'], description: 'Bet on a roll, 45% to double', usage: 'gamble <amount|all>' },
    coinflip:  { aliases: ['cf', 'flip'], description: 'Call heads or tails', usage: 'coinflip <heads|tails> <amount>' },
    slots:     { aliases: ['slot'], description: 'Spin the slot machine', usage: 'slots <amount>' },
    shop:      { aliases: ['store'], description: 'Browse the shop. Premium servers can add their own items', usage: 'shop [add|edit|remove]' },
    buy:       { aliases: ['purchase'], description: 'Buy an item from the shop', usage: 'buy <item> [amount]' },
    sell:      { aliases: [], description: 'Sell items you found or bought', usage: 'sell <item> [amount|all]' },
    inventory: { aliases: ['bag', 'items'], description: 'See what you own', usage: 'inventory [user]' },
    use:       { aliases: [], description: 'Use an item like a padlock or energy drink', usage: 'use <item>' },
    market:    { aliases: ['stocks'], description: 'See the share prices', usage: 'market' },
    invest:    { aliases: ['trade'], description: 'Buy or sell shares', usage: 'invest <buy|sell> <asset> <shares|all>' },
    portfolio: { aliases: ['holdings'], description: 'See your shares and how they are doing', usage: 'portfolio [user]' },
    richest:   { aliases: ['baltop', 'rich', 'ecotop'], description: 'The richest members of this server', usage: 'richest [page]' },
    economy:   { aliases: ['eco'], description: 'Economy settings and admin tools', usage: 'economy [enable|disable|currency|maxbet|drops|give|take|reset]' },
};

/** Work even while the economy is off in a server. Everything else needs an admin to run `economy enable`. */
const ALWAYS = new Set(['economy', 'balance', 'portfolio']);

/** The prefix command for one economy command. */
function build(name) {
    const meta = META[name];
    return {
        name, aliases: meta.aliases, description: meta.description, usage: meta.usage, category: 'economy',
        async execute(message, args = []) {
            if (!message.guild || message.author.bot) return;
            try {
                const g = await db.guild(message.guild.id);
                const ctx = { message, guild: message.guild, gid: message.guild.id, uid: message.author.id, name: message.member?.displayName ?? message.author.username, g };
                if (!g.enabled && !ALWAYS.has(name)) {
                    return say(ctx, `**${ctx.name}**, the economy isn't on in this server.\n-# an admin can turn it on with \`economy enable\``, 'warning');
                }
                ctx.premium = await prem.isUserPremium(ctx.uid);
                ctx.boost = ctx.premium ? prem.perks.economy.premium : prem.perks.economy.free;
                await H[name](ctx, args);
            } catch (err) {
                console.error(`[economy] ${name}:`, err);
                message.reply({ embeds: [ui.embed({ kind: 'error', description: 'Something went wrong with that command. Try again in a moment.' })], ...NOMENTION }).catch(() => {});
            }
        },
    };
}

module.exports = { build, META, money, E, H, HEART };
