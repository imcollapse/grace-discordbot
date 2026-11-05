// grace · /game: two player mini games. Works in DMs, on a user install and in servers.

const { SlashCommandBuilder } = require('discord.js');
const games = require('../../services/games');

const INFO = {
    tictactoe: ['Tic tac toe, three in a row wins', false],
    connect4:  ['Connect four, drop discs and line up four', false],
    rps:       ['Rock paper scissors, best of 3', false],
    quickdraw: ['Quick draw, whoever presses shoot first wins', true],
    trivia:    ['Trivia, five questions, play alone or against someone', false],
};

const data = new SlashCommandBuilder().setName('game').setDescription('Play a mini game with someone, even in DMs');
for (const [name, [desc, needs]] of Object.entries(INFO)) {
    data.addSubcommand((c) => c.setName(name).setDescription(desc)
        .addUserOption((o) => o.setName('opponent').setDescription(needs ? 'Who to play against' : 'Who to play against, leave empty to play grace').setRequired(needs)));
}

module.exports = {
    data,
    async execute(interaction) {
        await games.play(interaction, interaction.options.getSubcommand(), interaction.options.getUser('opponent'));
    },
};
