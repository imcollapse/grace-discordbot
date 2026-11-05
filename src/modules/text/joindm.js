// grace · ,joindm — the DM every new member gets
//   joindm setup               the configuration panel
//   joindm enable|disable
//   joindm message <text>      set the message (variables work)
//   joindm embed <name>        send a saved embed      (embed create)
//   joindm container <name>    send a saved container  (container create)
//   joindm link <url|reset>    where the "Sent from <server>" button goes
//   joindm test                send it to yourself
//   joindm reset

const { PermissionFlagsBits: P, MessageFlags } = require('discord.js');
const ui = require('../../services/ui');
const D = require('../../services/joinDm');
const G = require('../../services/greeter');
const { Embed, Container, JoinDm } = require('../../database/schemas');

const send = (m, c, extra = {}) => m.reply({ components: [c].flat(), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] }, ...extra });
const can = (m) => m.permissions.has(P.ManageGuild) || m.permissions.has(P.Administrator);
const ok = (t, s) => ui.notice('success', t, s ? { footer: s } : {});
const warn = (t, s) => ui.notice('warning', t, s ? { footer: s } : {});
const fail = (t) => ui.notice('error', t);

module.exports = {
  name: 'joindm',
  description: 'Send a DM to every new member',
  aliases: ['jdm', 'welcomedm'],
  usage: 'joindm setup | enable | disable | message <text> | embed <name> | container <name> | link <url> | test | reset',
  category: 'community',

  async execute(message, args = []) {
    if (!message.guild) return;
    const sub = (args[0] || '').toLowerCase();

    if (!sub) {
      return send(message, ui.box('base')
        .addTextDisplayComponents(ui.text('### Join DM\nNew members get a DM from the server. It always carries a button that shows which server sent it.'))
        .addSeparatorComponents(ui.sep(false))
        .addTextDisplayComponents(ui.text([
          '`joindm setup`  open the configuration panel',
          '`joindm enable`  /  `joindm disable`',
          '`joindm message <text>`  set the message',
          '`joindm embed <name>`  or  `joindm container <name>`  use a saved design',
          '`joindm link <url>`  where the button goes (`reset` for the server)',
          '`joindm test`  send it to yourself',
          '`joindm reset`',
        ].join('\n'))));
    }

    if (!can(message.member)) return send(message, ui.fail('You need the **Manage Server** permission.'));
    const guild = message.guild;
    const gid = guild.id;
    const row = await D.read(gid);
    const rest = args.slice(1).join(' ').trim();

    switch (sub) {
      case 'setup': case 'config': case 'status': case 'panel':
        return send(message, await D.panel(guild, row, { member: message.member }));

      case 'enable': case 'on':
        await D.change(gid, { enabled: true, ...(row?.message ? {} : { message: D.DEFAULT }) });
        return send(message, ok('Join DM is on.'));
      case 'disable': case 'off':
        await D.change(gid, { enabled: false });
        return send(message, ok('Join DM is off.'));

      case 'message': case 'text': case 'set': {
        if (!rest) return send(message, warn('Write the message: `joindm message Welcome {user}!`', 'Variables like {user} and {server} work.'));
        const { container, embed } = G.tagsOf(row?.message ?? '');
        const keep = [container && `{container:${container}}`, embed && `{embed:${embed}}`].filter(Boolean).join(' ');
        await D.change(gid, { message: `${rest.slice(0, D.MAX)} ${keep}`.trim() });
        return send(message, ok('Message saved.'));
      }

      case 'embed': case 'container': {
        const name = (args[1] || '').toLowerCase();
        if (!name) return send(message, warn(`Name a saved ${sub}: \`joindm ${sub} <name>\``));
        if (name === 'none' || name === 'off') {
          await D.change(gid, { message: G.bare(row?.message ?? D.DEFAULT) || D.DEFAULT });
          return send(message, ok(`The ${sub} was removed. Text only.`));
        }
        const Model = sub === 'embed' ? Embed : Container;
        if (!(await Model.findOne({ where: { guildId: gid, name } }))) return send(message, fail(`There is no ${sub} named \`${name}\`.`));
        const text = G.bare(row?.message ?? D.DEFAULT);
        await D.change(gid, { message: `${text} {${sub}:${name}}`.trim() });
        return send(message, ok(`Using the ${sub} \`${name}\`.`));
      }

      case 'link': case 'button': {
        const url = args[1];
        if (!url) return send(message, warn('Give a link: `joindm link https://discord.gg/invite`', 'Use `joindm link reset` to point at the server.'));
        if (['reset', 'none', 'off'].includes(url.toLowerCase())) { await D.change(gid, { link: null }); return send(message, ok('The button opens the server.')); }
        if (!D.validLink(url)) return send(message, fail('That is not a valid link. Start it with `https://`.'));
        await D.change(gid, { link: url.slice(0, 300) });
        return send(message, ok('Button link saved.'));
      }

      case 'test': case 'preview': {
        const { payload, problem } = await D.build(guild, message.member, row);
        if (!payload) return send(message, warn(problem ?? 'Nothing to send.'));
        try {
          await message.author.send({ ...payload, allowedMentions: { parse: [] } });
          return send(message, ok('Sent. Check your DMs.', problem));
        } catch {
          return send(message, fail('I can\'t DM you. Open your DMs for this server and try again.'));
        }
      }

      case 'reset': {
        await JoinDm.destroy({ where: { guildId: gid } });
        D.bust(gid);
        return send(message, ok('Join DM was reset.'));
      }
    }
    return send(message, warn('Unknown option.', 'Use `joindm` to see what is available.'));
  },
};
