// »» engineered by cosmin ««
// grace · /feedback  setup · panel · stats · config · reset

const { SlashCommandBuilder } = require('discord.js');
const F = require('../../services/feedback');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('feedback')
        .setDescription('Collect star reviews from your members')
        .addSubcommand(s => s.setName('setup').setDescription('Choose where reviews go (one screen)'))
        .addSubcommand(s => s.setName('panel').setDescription('Post the review panel in the review channel'))
        .addSubcommand(s => s.setName('stats').setDescription('Average rating, breakdown and latest reviews'))
        .addSubcommand(s => s.setName('config').setDescription('View the current feedback settings'))
        .addSubcommand(s => s.setName('reset').setDescription('Reset the feedback settings (reviews are kept)')),
    async execute(interaction) {
        return F.run(interaction, interaction.options.getSubcommand());
    },
};
