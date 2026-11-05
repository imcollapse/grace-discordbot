// grace · music · filter (audio effects)

const { ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { command } = require('../../../services/music/kit');
const ui = require('../../../services/music/ui');
const E = require('../../../services/music/emojis');

const FILTERS = [
    ['nightcore', 'Nightcore'], ['vaporwave', 'Vaporwave'], ['bassboost', 'Bassboost'], ['eightD', '8D'], ['karaoke', 'Karaoke'],
    ['vibrato', 'Vibrato'], ['tremolo', 'Tremolo'], ['slowed', 'Slowed'], ['distortion', 'Distortion'], ['pop', 'Pop'], ['soft', 'Soft'],
];

const POP = [[1, 0.35], [2, 0.25], [3, 0], [4, -0.25], [5, -0.3], [6, -0.2], [7, -0.1], [8, 0.15], [9, 0.25]];
const SOFT = [...Array(8).keys()].map((b) => [b, 0]).concat([8, 9, 10, 11, 12, 13].map((b) => [b, -0.25]));
const eph = (p) => ({ ...p, flags: p.flags | MessageFlags.Ephemeral });
const eq = (pairs) => pairs.map(([band, gain]) => ({ band, gain }));

function apply(f, id) {
    switch (id) {
        case 'nightcore': return f.setNightcore(true);
        case 'vaporwave': return f.setVaporwave(true);
        case 'bassboost': return f.setBassboost(true);
        case 'eightD': return f.set8D(true);
        case 'karaoke': return f.setKaraoke(true);
        case 'vibrato': return f.setVibrato(true);
        case 'tremolo': return f.setTremolo(true);
        case 'slowed': return f.setSlowmode(true);
        case 'distortion': return f.setDistortion(true);
        case 'pop': return f.setEqualizer(eq(POP));
        case 'soft': return f.setEqualizer(eq(SOFT));
        default: return null;
    }
}

function panel() {
    const rows = [new ActionRowBuilder(), new ActionRowBuilder(), new ActionRowBuilder()];
    FILTERS.forEach(([id, label], i) => {
        rows[Math.min(2, Math.floor(i / 5))].addComponents(
            new ButtonBuilder().setCustomId(`filter_${id}`).setLabel(label).setStyle(ButtonStyle.Secondary),
        );
    });
    rows[2].addComponents(new ButtonBuilder().setCustomId('filter_reset').setLabel('Reset').setStyle(ButtonStyle.Danger));

    return new ContainerBuilder().setAccentColor(ui.WHITE)
        .addTextDisplayComponents(ui.text(`## ${E.filter} Audio Filters\nselect a filter to apply to the music:`))
        .addSeparatorComponents(ui.divider())
        .addActionRowComponents(rows[0])
        .addActionRowComponents(rows[1])
        .addActionRowComponents(rows[2]);
}

module.exports = command({
    name: 'filter',
    slash: false,   // prefix-only: frees a slash-command slot
    aliases: ['filters', 'fx'],
    description: 'Apply an audio filter (equalizer)',
    guard: { player: true, control: true },
    async run(ctx, _p, player) {
        const { customFilter } = require('poru');
        if (!(player.filters instanceof customFilter)) player.filters = new customFilter(player);

        const msg = await ctx.respond({ components: [panel()], flags: ui.V2_FLAGS, allowedMentions: ui.NO_PINGS });

        player.filterCollector?.stop('replaced');
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 10 * 60 * 1000 });
        player.filterCollector = collector;

        collector.on('collect', async (i) => {
            if (i.user.id !== ctx.user.id) return i.reply(eph(ui.fail('only the command user can use these buttons'))).catch(() => {});
            const live = ctx.poru?.players?.get(ctx.guild.id);
            if (!live) return collector.stop('gone');
            if (!(live.filters instanceof customFilter)) live.filters = new customFilter(live);

            const id = i.customId.replace('filter_', '');
            try {
                if (id === 'reset') live.filters.clearFilters(true);
                else if (apply(live.filters, id) === null) return;
                await live.filters.updateFilters();
                await i.reply(eph(ui.ok(id === 'reset' ? 'all filters have been reset' : `applied **${id}** filter`)));
            } catch (e) {
                await i.reply(eph(ui.fail(`could not apply filter: ${e.message}`))).catch(() => {});
            }
        });
        collector.on('end', async () => {
            if (player.filterCollector === collector) player.filterCollector = null;
            await msg.edit({ components: [] }).catch(() => {});
        });
    },
});
