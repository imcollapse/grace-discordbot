// grace · commands that work in DMs and as a user install (no server needed).
// Slash: bootstrap registers only these for DMs and user installs. Prefix: handleDM() below runs them from a DM.

const config = require('../settings');

/** Prefix command names that are safe without a server. Anything marked `dm: true` in its file also counts. */
const DM_NAMES = new Set([
    'avatar', 'banner', 'userinfo', 'ping', 'birthday', 'hash', 'wikipedia', 'crypto', 'remind', 'todo', 'ai', 'ip', 'domain', 'lookup',
    'vanity', 'usernames', 'help', 'premium', 'language', 'feedback', 'updates', 'define', 'calc', 'urban', 'animals',
    'conversion', 'dechex', 'hexdec', 'binstr', 'strbin', 'intbin', 'binint', 'ft', 'cm', 'kg', 'rot13', 'encode', 'base32', 'ascii85', 'hex',
    'instagram', 'tiktok', 'youtube', 'twitter', 'twitch', 'reddit', 'github',
]);
/** Slash command names shown in DMs and for user installs. Everything else is server only. */
const DM_SLASH = new Set([
    'tools', 'game', 'birthday', 'ai', 'avatar', 'banner', 'userinfo', 'ping', 'botstats', 'wikipedia', 'crypto', 'conversion', 'remind', 'todo', 'ip', 'domain',
    'lookup', 'vanity', 'usernames', 'help', 'premium', 'language', 'feedback', 'updates', 'animals', 'instagram', 'tiktok',
    'youtube', 'twitter', 'twitch', 'reddit', 'github',
]);

const dmOk = (cmd) => !!cmd && (cmd.dm === true || DM_NAMES.has(cmd.name));

async function handleDM(message, client) {
    try {
        let content = (message.content || '').trim();
        if (!content) return;
        const mention = `<@${client.user.id}>`, mentionAlt = `<@!${client.user.id}>`;
        let prefixed = false;
        for (const p of [config.PREFIX, mention, mentionAlt]) {
            if (p && content.startsWith(p)) { content = content.slice(p.length).trim(); prefixed = true; break; }
        }
        const words = content.split(/ +/);
        for (let n = Math.min(words.length, 3); n > 0; n--) {
            const cmd = client.prefixCommands?.get(words.slice(0, n).join(' ').toLowerCase());
            if (!cmd) continue;
            if (!dmOk(cmd)) {
                if (prefixed) await message.reply({ content: `\`${cmd.name}\` only works in a server. Commands that work here: \`${config.PREFIX}help\``, allowedMentions: { parse: [] } }).catch(() => {});
                return;
            }
            try {
                const { Blacklist } = require('../database/schemas');
                if (await Blacklist.model.findOne({ where: { type: 'user', entityId: message.author.id } })) return;
            } catch { /* no blacklist table: carry on */ }
            await cmd.execute(message, words.slice(n), client);
            return;
        }
    } catch (err) {
        console.error('[dm] command failed:', err.message);
    }
}

module.exports = { DM_NAMES, DM_SLASH, dmOk, handleDM };
