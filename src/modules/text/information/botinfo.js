// dev: cosmin | module: botinfo

const os = require('os');
const { MessageFlags } = require('discord.js');
const config = require('../../../settings');
const i18n = require('../../../localization');
const ui = require('../../../services/ui');
const SF = require('../../../services/statsFormat');

const PAGES = ['overview', 'system', 'credits'];
const ACCENT = { overview: 0xF2873A, system: 0x7FB7A4, credits: 0xC9A0DC };
const ID = (p) => `hope_bi_${p}`;

const T = (tr, key, fallback) => (tr.has && tr.has(key) ? tr(key) : fallback);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const ver = (name) => { try { return require(`${name}/package.json`).version; } catch { return '?'; } };

async function getPrefix(guildId) {
    if (guildId) {
        try {
            const { GuildPrefix } = require('../../../database/schemas');
            const custom = await GuildPrefix.getPrefix(guildId);
            if (custom) return custom;
        } catch (_) {}
    }
    return config.PREFIX;
}

/** Everything the three pages need, gathered once per render. */
async function gather(client, guildId, tr) {
    const mem = process.memoryUsage();
    const cpus = os.cpus() || [];
    return {
        prefix: await getPrefix(guildId),
        servers: client.guilds.cache.size,
        users: client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
        channels: client.channels.cache.size,
        commands: require('../../../services/statsFormat').commandTotal(client),
        uptime: tr.duration(client.uptime, { compact: true }),
        ping: Math.round(client.ws.ping),
        mem, cpuModel: (cpus[0]?.model || 'Unknown').replace(/\s+/g, ' ').trim(), cores: cpus.length,
        load: os.loadavg().map((n) => n.toFixed(2)).join(' · '),
        hostUptime: tr.duration(os.uptime() * 1000, { compact: true }),
    };
}

function pageContent(page, d, client, tr) {
    const L = (k, f) => T(tr, k, f);
    if (page === 'system') {
        return {
            tagline: `${os.type()} ${os.arch()} · ${d.cores} core${d.cores === 1 ? '' : 's'}`,
            text: [
                `- **${L('botinfo.runtime', 'Runtime')}**`,
                `  - **Node.js:** \`${process.version}\``,
                `  - **discord.js:** \`v${require('discord.js').version}\``,
                `  - **${L('botinfo.platform', 'Platform')}:** \`${os.type()} ${os.release()} (${os.arch()})\``,
                ``,
                `- **${L('botinfo.resources', 'Resources')}**`,
                `  - **${L('botinfo.memory', 'Memory')}:** \`${mb(d.mem.rss)}\` RSS · \`${mb(d.mem.heapUsed)}\` / \`${mb(d.mem.heapTotal)}\` heap`,
                `  - **CPU:** \`${d.cpuModel}\``,
                `  - **${L('botinfo.load', 'Load average')}:** \`${d.load}\``,
                `  - **${L('botinfo.hostuptime', 'Host uptime')}:** \`${d.hostUptime}\``,
                ``,
                `- **${L('botinfo.connection', 'Connection')}**`,
                `  - **${L('botinfo.wsping', 'WebSocket ping')}:** \`${d.ping} ms\``,
                `  - **${L('botinfo.uptime', 'Uptime')}:** \`${d.uptime}\``,
            ],
        };
    }
    if (page === 'credits') {
        const owner = config.OWNER_ID && /^\d+$/.test(config.OWNER_ID) ? `<@${config.OWNER_ID}>` : null;
        return {
            tagline: L('botinfo.madewith', 'Crafted with care, one command at a time'),
            text: [
                `- **${L('botinfo.development', 'Development')}**`,
                `  - **${L('botinfo.developer', 'Developer')}:** cosmin`,
                ...(owner ? [`  - **${L('botinfo.owner', 'Owner')}:** ${owner}`] : []),
                ``,
                `- **${L('botinfo.builtwith', 'Built with')}**`,
                `  - **discord.js** \`v${require('discord.js').version}\``,
                `  - **Sequelize** \`v${ver('sequelize')}\``,
                `  - **@napi-rs/canvas** \`v${ver('@napi-rs/canvas')}\``,
                `  - **Node.js** \`${process.version}\``,
                ``,
                `- **${L('botinfo.artwork', 'Artwork')}**`,
                `  - Gloock & Outfit typefaces · SIL Open Font License`,
            ],
        };
    }
    return {
        tagline: `${SF.compact(d.servers)} ${L('botinfo.servers', 'Servers').toLowerCase()} · ${SF.commandLabel(d.commands)} ${L('botinfo.commands', 'Commands').toLowerCase()}`,
        text: [
            `- **${tr('botinfo.overview')}**`,
            `  - **${tr('botinfo.prefix')}:** \`${d.prefix}\``,
            ...(config.OWNER_ID && /^\d+$/.test(config.OWNER_ID) ? [`  - **${tr('botinfo.owner')}:** <@${config.OWNER_ID}>`] : []),
            `  - **${tr('botinfo.uptime')}:** \`${d.uptime}\``,
            `  - **${L('botinfo.ping', 'Ping')}:** \`${d.ping} ms\``,
            ``,
            `- **${tr('botinfo.stats')}**`,
            `  - **${tr('botinfo.servers')}:** ${SF.compact(d.servers)}`,
            `  - **${tr('botinfo.users')}:** ${SF.compact(d.users)}`,
            `  - **${tr('botinfo.channels')}:** ${tr.num(d.channels)}`,
            `  - **${L('botinfo.commands', 'Commands')}:** ${SF.commandLabel(d.commands)}`,
        ],
    };
}

const LABEL = { overview: ['botinfo.tab.overview', 'Overview'], system: ['botinfo.tab.system', 'System'], credits: ['botinfo.tab.credits', 'Credits'] };

const TITLE = { overview: null, system: 'System', credits: 'Credits' };

/** One container: linked title, a line, "made by", and the numbers as small code chips next to the avatar. */
async function build(client, guildId, tr) {
    const d = await gather(client, guildId, tr);
    const name = client.user.username;
    const avatar = client.user.displayAvatarURL({ extension: 'png', size: 256 });
    const support = config.SUPPORT_SERVER;
    const link = (t) => (support ? `[${t}](${support})` : t);
    const n = (v) => Number(v).toLocaleString('en-US');

    const stats = [
        `\`${d.uptime}\` ${T(tr, 'botinfo.uptime', 'Uptime')}`,
        `\`${d.ping}ms\` ${T(tr, 'botinfo.ping', 'Latency')}`,
        `\`${n(d.servers)}\` ${T(tr, 'botinfo.servers', 'Servers')}`,
        `\`${n(d.users)}\` ${T(tr, 'botinfo.users', 'Users')}`,
        `\`${n(d.commands)}\` ${T(tr, 'botinfo.commands', 'Commands')}`,
    ].join('\n');

    const box = ui.box('base');
    box.addTextDisplayComponents(ui.text(`# ${link(name)}`));
    box.addSeparatorComponents(ui.sep(true));
    box.addSectionComponents(ui.section(`${ui.sub(`made by the **${link(`${name.toLowerCase()} team`)}**`)}\n\n${stats}`, avatar));
    return { components: [box] };
}

// Kept for anything that still wants a plain container (no banner / buttons).
async function buildBotInfoContainer(client, guildId, tr = i18n.translatorFor('en')) {
    const d = await gather(client, guildId, tr);
    return ui.box('base').addTextDisplayComponents(ui.text(pageContent('overview', d, client, tr).text.join('\n')));
}

module.exports = {
    name: 'botinfo',
    description: "Shows the bot's info",
    aliases: ['bi'],

    async execute(message) {
        const tr = i18n.translator(message);
        await message.reply({ ...(await build(message.client, message.guildId, tr)), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    },

    buildBotInfoContainer,
};
