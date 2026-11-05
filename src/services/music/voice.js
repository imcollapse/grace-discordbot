/* grace · music · voice state handling: bot kicked/disconnected, and leaving an empty channel */

const E = require('./emojis');
const { say, stopCollectors } = require('./events');
const stay = require('./stay');

const aloneTimeouts = new Map();
const ALONE_MS = 60000;

function clearAlone(guildId) {
    const t = aloneTimeouts.get(guildId);
    if (t) { clearTimeout(t); aloneTimeouts.delete(guildId); }
}

async function onVoiceState(oldState, newState) {
    const client = newState.client || oldState.client;
    const guild = newState.guild;
    const player = client.poru?.players?.get(guild.id);
    if (!player) { clearAlone(guild.id); return; }

    // the bot itself was disconnected
    if (newState.id === client.user.id && !newState.channelId) {
        clearAlone(guild.id);
        if (!stay.isOn(guild.id)) await say(client, player, `${E.stop} I was disconnected from the voice channel. Clearing the queue.`);
        stopCollectors(player, 'botDisconnected');
        player.destroy();
        return;
    }

    const channel = guild.channels.cache.get(player.voiceChannel);
    if (!channel) return;
    const listeners = channel.members.filter((m) => !m.user.bot).size;

    if (listeners > 0 || stay.isOn(guild.id)) { clearAlone(guild.id); return; }   // 24/7 never leaves
    if (aloneTimeouts.has(guild.id)) return;

    aloneTimeouts.set(guild.id, setTimeout(async () => {
        aloneTimeouts.delete(guild.id);
        const current = client.poru.players.get(guild.id);
        if (!current) return;
        const ch = guild.channels.cache.get(current.voiceChannel);
        if (!ch || ch.members.filter((m) => !m.user.bot).size > 0) return;
        await say(client, current, `${E.stop} Left the voice channel due to inactivity. No one was listening.`);
        stopCollectors(current, 'alone');
        current.destroy();
    }, ALONE_MS));
}

module.exports = { onVoiceState };
