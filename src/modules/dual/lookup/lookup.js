// grace · ,lookup  ·  /lookup   browse released usernames and vanity codes (captcha first)

const { SlashCommandBuilder } = require('discord.js');
const gate = require('../../../services/lookupGate');
const panel = require('../../../services/lookupPanel');

const isSlash = (ctx) => !!ctx.isChatInputCommand?.();

module.exports = {
  data: new SlashCommandBuilder().setName('lookup').setDescription('Browse released usernames and vanity codes')
    .addStringOption(o => o.setName('type').setDescription('Which list to open').addChoices({ name: 'Usernames', value: 'username' }, { name: 'Vanities', value: 'vanity' })),
  slashOptional: true,
  name: 'lookup',
  aliases: ['lk', 'dropped'],
  description: 'Browse released usernames and vanity codes',
  usage: 'lookup [usernames|vanities]',
  category: 'utility',

  async execute(ctx, args = []) {
    let kind = 'username';
    if (isSlash(ctx)) {
      if (!ctx.deferred && !ctx.replied) await ctx.deferReply();
      kind = ctx.options.getString('type') ?? 'username';
    } else if (/^v/i.test(args[0] ?? '')) kind = 'vanity';
    try {
      if (!(await gate.ensure(ctx))) return;
      return await panel.open(ctx, kind);
    } catch (e) { console.error('[lookup]', e); }
  },
};
