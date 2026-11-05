// grace · leaderboard levels: the XP leaderboard (same view as `level top`).

module.exports = {
    async execute(ctx) {
        return require('../../../../services/levelBoard').show(ctx);
    },
};
