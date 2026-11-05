const viewer = require('../../../../services/family/viewer');

module.exports = {
    async execute(w) {
        const [target] = await w.users(['user']);
        w.page = 'profile';
        return viewer.open(w, target || w.user);
    },
};
