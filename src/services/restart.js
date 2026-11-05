/*
 * grace · process restart
 *
 * perform(client, info)  closes Discord + the database and brings the bot back up.
 * announce(client)       runs once after start-up and turns the "Rebooting" message into "Back online".
 *
 * How the new process starts:
 *   - under a supervisor (pm2, Docker, Pterodactyl, Kubernetes) the process exits and the supervisor starts it again
 *   - on a bare `node` / `npm start` it spawns a fresh copy of itself and exits
 * Override with RESTART_MODE=exit | spawn in .env.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { MessageFlags } = require('discord.js');

const STATE = path.join(__dirname, '..', '.reboot.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mode() {
    const forced = String(process.env.RESTART_MODE || '').toLowerCase();
    if (forced === 'exit' || forced === 'spawn') return forced;
    const supervised = process.env.pm_id !== undefined || process.env.P_SERVER_UUID || process.env.KUBERNETES_SERVICE_HOST
        || process.env.container || fs.existsSync('/.dockerenv');
    return supervised ? 'exit' : 'spawn';
}

async function perform(client, info = {}) {
    try { fs.writeFileSync(STATE, JSON.stringify({ ...info, at: Date.now() })); } catch { /* the reply just won't be edited */ }

    await sleep(400);
    try { client.destroy(); } catch { /* already down */ }
    try { await require('../database/schemas').sequelize.close(); } catch { /* not connected */ }

    if (mode() === 'spawn') {
        const child = spawn(process.argv[0], [...process.execArgv, ...process.argv.slice(1)], {
            cwd: process.cwd(), env: process.env, detached: true, stdio: 'inherit',
        });
        child.unref();
        process.exit(0);
    }
    process.exit(1); // non-zero so pm2 / Docker / panels treat it as "restart me"
}

/** Edits the message that asked for the reboot. Safe to call on every start. */
async function announce(client) {
    let state;
    try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return; }
    try { fs.unlinkSync(STATE); } catch { /* ignore */ }
    if (!state?.channelId || !state?.messageId) return;

    const ui = require('./ui');
    const secs = ((Date.now() - state.at) / 1000).toFixed(1);
    const card = ui.box('success')
        .addTextDisplayComponents(ui.text(`### Back online`))
        .addTextDisplayComponents(ui.text(ui.sub(`rebooted in ${secs}s · ${client.guilds.cache.size} servers`)));

    try {
        const channel = await client.channels.fetch(state.channelId);
        const msg = await channel.messages.fetch(state.messageId);
        await msg.edit({ components: [card], flags: MessageFlags.IsComponentsV2 });
    } catch { /* message or channel is gone */ }
}

module.exports = { perform, announce, mode };
