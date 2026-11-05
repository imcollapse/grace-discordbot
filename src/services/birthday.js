// grace · birthday helpers: reading dates, working out the next one, and the announcement embed.

const ui = require('./ui');
const { icon } = require('./icons');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];   // February allows the 29th
const monthFrom = (w) => { const i = MONTHS.findIndex((m) => m.toLowerCase().startsWith(w.toLowerCase().slice(0, 3))); return w.length >= 3 && i >= 0 ? i + 1 : null; };

/**
 * "14 mar 2005", "mar 14", "14/03", "14-3-2005", "14 march". Day first for numbers (14/03).
 * Returns { month, day, year|null } or { error }.
 */
function parseDate(input) {
    const t = String(input ?? '').trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/[,]/g, ' ').split(/[\s/.\-]+/).filter(Boolean);
    if (t.length < 2 || t.length > 3) return { error: 'I couldn\'t read that date. Try `14 mar`, `14/03` or `14 mar 2005`.' };
    let day, month, year = null;
    const num = (s) => (/^\d+$/.test(s) ? Number(s) : null);
    if (num(t[0]) !== null && monthFrom(t[1]) !== null) { day = num(t[0]); month = monthFrom(t[1]); if (t[2]) year = num(t[2]); }
    else if (monthFrom(t[0]) !== null && num(t[1]) !== null) { month = monthFrom(t[0]); day = num(t[1]); if (t[2]) year = num(t[2]); }
    else if (num(t[0]) !== null && num(t[1]) !== null) { day = num(t[0]); month = num(t[1]); if (t[2]) year = num(t[2]); }
    else return { error: 'I couldn\'t read that date. Try `14 mar`, `14/03` or `14 mar 2005`.' };
    if (t[2] && year === null) return { error: 'The year has to be a number, like `2005`.' };
    if (!month || month < 1 || month > 12) return { error: 'That month doesn\'t exist.' };
    if (!day || day < 1 || day > DAYS_IN[month - 1]) return { error: `${MONTHS[month - 1]} doesn't have a day ${day}.` };
    if (year !== null) {
        const now = new Date().getUTCFullYear();
        if (year < 100) year += year > now % 100 ? 1900 : 2000;
        if (year < 1900 || year > now) return { error: 'That year doesn\'t look right.' };
        if (month === 2 && day === 29 && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) return { error: `${year} wasn't a leap year, so there was no 29 February.` };
    }
    return { month, day, year };
}

/** "+5:30", "-8", "utc", "utc+2" → minutes. */
function parseOffset(input) {
    const m = String(input ?? '').trim().toLowerCase().match(/^(?:utc|gmt)?\s*(?:([+-])\s*(\d{1,2})(?::?(\d{2}))?)?$/);
    if (!m) return null;
    const mins = m[2] ? (Number(m[2]) * 60 + Number(m[3] ?? 0)) * (m[1] === '-' ? -1 : 1) : 0;
    return Math.abs(mins) <= 14 * 60 ? mins : null;
}
const offsetLabel = (mins) => `UTC${mins < 0 ? '-' : '+'}${Math.floor(Math.abs(mins) / 60)}${Math.abs(mins) % 60 ? ':' + String(Math.abs(mins) % 60).padStart(2, '0') : ''}`;

const isLeap = (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
/** Today's month, day and year in a place that is `offsetMin` minutes from UTC. */
function localToday(offsetMin = 0, now = Date.now()) {
    const d = new Date(now + offsetMin * 60000);
    return { month: d.getUTCMonth() + 1, day: d.getUTCDate(), year: d.getUTCFullYear() };
}
/** A 29 February birthday is celebrated on the 28th in years that have no 29th. */
const matchesToday = (row, today) => (row.month === today.month && row.day === today.day)
    || (row.month === 2 && row.day === 29 && !isLeap(today.year) && today.month === 2 && today.day === 28);

/** Days until the next one (0 = today) and the age they turn, when the year is known. */
function nextOne(row, offsetMin = 0, now = Date.now()) {
    const t = localToday(offsetMin, now);
    const base = Date.UTC(t.year, t.month - 1, t.day);
    let y = t.year;
    const at = (yr) => { const d = row.month === 2 && row.day === 29 && !isLeap(yr) ? 28 : row.day; return Date.UTC(yr, row.month - 1, d); };
    if (at(y) < base) y += 1;
    return { days: Math.round((at(y) - base) / 86400000), turns: row.year ? y - row.year : null, year: y };
}

const pretty = (row) => `${row.day} ${MONTHS[row.month - 1]}`;

const DEFAULT_MESSAGE = '**It\'s {user}\'s birthday today!**\n> Wish them a happy one{age}';
function fill(template, { user, member, guild, row, today }) {
    const age = row.year ? today.year - row.year : null;
    return String(template ?? DEFAULT_MESSAGE)
        .replaceAll('{user}', `<@${user.id}>`).replaceAll('{name}', member?.displayName ?? user.username)
        .replaceAll('{server}', guild.name).replaceAll('{age}', age ? ` (turning ${age})` : '');
}

/** The announcement embed for one member. */
function announcement({ user, member, guild, row, cfg, today }) {
    const mark = icon('birthday');
    return ui.embed({
        kind: 'warning',
        description: `${mark ? mark + ' ' : ''}${fill(cfg.message, { user, member, guild, row, today })}`,
        thumbnail: (member ?? user).displayAvatarURL({ extension: 'png', size: 256 }),
        footer: guild.name,
    });
}

module.exports = { MONTHS, parseDate, parseOffset, offsetLabel, localToday, matchesToday, nextOne, pretty, announcement, fill, DEFAULT_MESSAGE };
