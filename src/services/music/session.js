/* grace · music · get-or-create the guild player */

const { PermissionFlagsBits } = require('discord.js');
const ui = require('./ui');
const { MSG } = require('./kit');

/** Returns a ready Poru player for the member's voice channel, or null after replying with the reason. */
async function ensurePlayer(ctx) {
    const vc = ctx.member.voice.channel;
    const existing = ctx.player;
    if (existing) {
        if (vc.id !== existing.voiceChannel) { await ctx.fail(MSG.sameChannel); return null; }
        return existing;
    }

    const perms = vc.permissionsFor(ctx.guild.members.me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
        await ctx.fail(`i need **view channel**, **connect** and **speak** in ${vc}`);
        return null;
    }

    try {
        const player = ctx.poru.createConnection({
            guildId: ctx.guild.id,
            voiceChannel: vc.id,
            textChannel: ctx.channel.id,
            deaf: true,
        });
        if (player.autoplayEnabled === undefined) player.autoplayEnabled = false;
        return player;
    } catch (e) {
        console.error('[music] createConnection failed:', e.message);
        await ctx.respond(ui.fail('no lavalink node is available right now, try again in a moment'));
        return null;
    }
}

/** Adds tracks (stamping the requester) and starts playback when idle. */
function enqueue(player, tracks, user) {
    for (const t of tracks) {
        t.info.requester = user;
        player.queue.add(t);
    }
    if (!player.isPlaying && player.isConnected) player.play();
}

module.exports = { ensurePlayer, enqueue };
