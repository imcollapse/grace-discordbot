/* ⌁ crafted by cosmin ⌁ */

const { Events } = require('discord.js');
const { J2CConfig, TempChannel } = require('../database/schemas');

const j2cConfigCache = new Map();
const J2C_CACHE_TTL = 60000;

async function getJ2CConfig(guildId) {
    const cached = j2cConfigCache.get(guildId);
    if (cached && Date.now() - cached.ts < J2C_CACHE_TTL) return cached.val;
    const config = await J2CConfig.findOne({ where: { guildId }, raw: true });
    j2cConfigCache.set(guildId, { val: config, ts: Date.now() });
    return config;
}

module.exports = {
    name: Events.VoiceStateUpdate,
    /** Drop the cached config so setup/reset take effect immediately instead of after up to 60s. */
    invalidate: (guildId) => j2cConfigCache.delete(guildId),
    async execute(oldState, newState) {
        const client = newState.client || oldState.client;

        try { await require('../services/music/voice').onVoiceState(oldState, newState); } catch (e) { console.error('[music] voice state error:', e.message); }

        const guild = newState.guild;
        const member = newState.member;
        if (!member) return;

        const guildId = guild.id;
        const config = await getJ2CConfig(guildId);
        if (!config) return;

        // Create a temp VC only for humans joining the hub channel.
        if (!member.user.bot && newState.channel && newState.channel.id === config.voiceChannelId) {
            const category = guild.channels.cache.get(config.categoryId);
            if (category) {
                try {
                    const newVC = await guild.channels.create({
                        name: `${member.displayName}'s VC`,
                        type: 2,
                        parent: category.id,
                        reason: 'Join to Create'
                    });
                    await TempChannel.create({ channelId: newVC.id, guildId, ownerId: member.id });
                    try { await member.voice.setChannel(newVC); }
                    catch { await cleanupIfEmpty(guild, newVC.id); }
                } catch (error) {
                    console.error('Error creating temp VC:', error);
                }
            }
        }

        // Anyone (human or bot) leaving/moving out of a channel can leave it without humans.
        if (oldState.channelId && oldState.channelId !== newState.channelId) {
            await cleanupIfEmpty(guild, oldState.channelId);
        }
    },
    cleanupIfEmpty,
    sweepGuild,
};

/** A temp VC counts as empty when no non-bot members remain. */
async function cleanupIfEmpty(guild, channelId) {
    try {
        const temp = await TempChannel.findOne({ where: { guildId: guild.id, channelId }, raw: true });
        if (!temp) return;
        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (channel) {
            if (channel.members.some(m => !m.user.bot)) return;
            // Disconnect leftover bots (e.g. music bot) so they don't sit in a dead channel.
            for (const m of channel.members.values()) {
                if (m.id === guild.client.user.id) {
                    try { await require('../services/music/voice').leave?.(guild.id); } catch {}
                }
                await m.voice.disconnect('Temporary VC is empty').catch(() => {});
            }
            await channel.delete('Temporary VC is empty').catch(e => console.error('Error deleting temp VC:', e.message));
        }
        await TempChannel.destroy({ where: { channelId } });
    } catch (error) {
        console.error('Error deleting temp VC:', error);
    }
}

/** Remove stale temp channels (e.g. left over after a restart). */
async function sweepGuild(guild) {
    try {
        const rows = await TempChannel.findAll({ where: { guildId: guild.id }, raw: true });
        for (const r of rows) await cleanupIfEmpty(guild, r.channelId);
    } catch (e) { console.error('[voicemaster] sweep failed:', e.message); }
}
