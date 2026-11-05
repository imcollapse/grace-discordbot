// grace · profileedit: opens the profile editor (same as `profile edit`).

module.exports = {
    name: 'profileedit',
    description: 'Design your profile card: details, banner and theme',
    aliases: ['editprofile', 'pedit'],
    category: 'general',
    async execute(message) {
        return require('../dual/profile/subcommands/edit').execute(message);
    },
};
