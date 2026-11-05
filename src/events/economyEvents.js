// grace · economy chat drops. In servers that turned drops on, a purse now and then lands in a busy channel.
// The first person to press Claim keeps it. Rare by design: at most one every 20 minutes per server.

const { MessageFlags } = require('discord.js');
const ui = require('../services/ui');
const { icon } = require('../services/icons');
const D = require('../services/economy/data');

const lastDrop = new Map();   // guildId -> time
const recent = new Map();     // channelId -> message count since the last check
const EVERY = 20 * 60000;
const CHANCE = 1 / 45;        // per message once the cooldown has passed

function init(client) {
    client.on('messageCreate', async (message) => {
        try {
            if (!message.guild || message.author.bot || message.webhookId) return;
            const db = require('../database/economy');
            const g = await db.guild(message.guild.id);
            if (!g.enabled || !g.drops) return;
            if (g.drop_channel && g.drop_channel !== message.channelId) return;
            if (Date.now() - (lastDrop.get(message.guild.id) ?? 0) < EVERY) return;
            if (Math.random() > CHANCE) return;
            lastDrop.set(message.guild.id, Date.now());
            await drop(message.channel, g);
        } catch (e) { console.error('[economy] drop:', e.message); }
    });
}

async function drop(channel, g) {
    const db = require('../database/economy');
    const prem = require('../services/premium');
    const { money, HEART } = require('../services/economy/commands');
    const amount = D.rand(...D.REWARD.drop);
    const id = `eco_drop_${Date.now()}`;
    const msg = await channel.send({
        embeds: [ui.embed({ description: `**a purse fell on the floor** ${HEART}\n> ${money(amount, g)} inside\n-# first to press claim keeps it` })],
        components: [ui.row(ui.btn(id, 'Claim', { style: 'success', emoji: icon('eco_drop') || undefined }))],
        allowedMentions: { parse: [] },
    });
    const collector = msg.createMessageComponentCollector({ filter: (i) => i.customId === id, time: 120000, max: 1 });
    collector.on('collect', async (i) => {
        const boost = (await prem.isUserPremium(i.user.id)) ? prem.perks.economy.premium : 1;
        const got = Math.floor(amount * boost);
        const after = await db.change(i.guildId, i.user.id, { wallet: got, earn: got });
        await i.update({
            embeds: [ui.embed({ kind: 'success', description: `**${i.member?.displayName ?? i.user.username} grabbed the purse** ${HEART}\n> found ${money(got, g)}\n-# their balance is ${money(after.wallet, g)}` })],
            components: [],
        }).catch(() => {});
    });
    collector.on('end', (c) => {
        if (c.size) return;
        msg.edit({ embeds: [ui.embed({ description: `**the purse was taken by the wind** ${HEART}\n-# nobody claimed it in time` })], components: [] }).catch(() => {});
    });
}

module.exports = { init, drop };
