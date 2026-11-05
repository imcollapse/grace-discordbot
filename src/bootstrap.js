/** @author cosmin */

const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
require('./services/noAccent');          // containers stay clean: no accent colour
const Dokdo = require('dokdo');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./settings');
const { loadSlashCommands, loadPrefixCommands, loadHybridCommands, reloadAllCommands } = require('./services/commandLoader');
const { colors, printHeader, printLoading, printSuccess, printError, printWarn, printInfo, printSystemReady } = require('./services/consoleLogger');
const botLogger    = require('./services/botLogger');
const runEmojiSync = require('./services/emojiSync');
const { applyMobileIdentify, wsOptions } = require('./services/gateway');
const { startPresence } = require('./services/presence');
const branding = require('./services/branding');
const i18n = require('./localization');

printHeader();

const _emitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  const msg = typeof warning === 'string' ? warning : warning?.message ?? '';
  if (msg.includes('ready event has been renamed to clientReady')) return;
  return _emitWarning.call(process, warning, ...args);
};

process.on('unhandledRejection', (error) => {
  printError(`Unhandled rejection: ${error?.message ?? String(error)}`);
});

process.on('uncaughtException', (error) => {
  printError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

(async () => {
  await runEmojiSync();

  global.grace = {
    bot: { color: '#F4C2C2' },
    addons: {
      ai: { geminiApiKeys: null }
    },
    db: { timezone: '+00:00' }
  };

  applyMobileIdentify();

  require('./services/welcomeBanner').install();   // {banner} variables → generated pictures
  const client = new Client({
    // Global safeguard: user-supplied text can never ping @everyone/@here/roles.
    // Code that really needs a role ping passes its own allowedMentions.
    allowedMentions: { parse: ['users'], repliedUser: false },
    ws: wsOptions,
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  branding.attach(client);

  client.commands = new Collection();

  // music (Lavalink / Poru). A no-op when LAVALINK_HOSTS is not set.
  require('./services/music').init(client);
  client.prefixCommands = new Collection();

  if (!process.env.SHELL) process.env.SHELL = '/bin/bash';

  client.dokdo = new Dokdo.Client(client, {
    prefix: config.PREFIX,
    aliases: ['dok', 'jsk'],
    owners: [config.OWNER_ID],
    secrets: [config.BOT_TOKEN]
  });

  client.reloadAllCommands = function () {
    try {
      return reloadAllCommands(this, __dirname);
    } catch (error) {
      return { success: false, message: 'Failed to reload commands', error: error.stack };
    }
  };

  const commandsPath  = path.join(__dirname, 'modules', 'interactions');
  const pCommandsPath = path.join(__dirname, 'modules', 'text');
  const hybridPath    = path.join(__dirname, 'modules', 'dual');

  loadSlashCommands(client, commandsPath);
  loadPrefixCommands(client, pCommandsPath);
  loadHybridCommands(client, hybridPath);

  printLoading('Event handlers');
  const eventsPath = path.join(__dirname, 'events');
  let loadedEvents = 0;

  if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file);
      const event = require(filePath);
      if ('name' in event && 'execute' in event) {
        // resolved from the cache on every event so `reload` can swap the file without touching listeners
        const resolved = require.resolve(filePath);
        client.on(event.name, (...args) => (require.cache[resolved]?.exports ?? event).execute(...args, client));
        loadedEvents++;
      }
    }

    const eventSubdirs = ['logging', 'antinuke', 'automod'];
    const subdirsLoaded = [];
    for (const subdir of eventSubdirs) {
      const subdirPath = path.join(eventsPath, subdir);
      if (!fs.existsSync(subdirPath)) continue;
      const files = fs.readdirSync(subdirPath).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const mod = require(path.join(subdirPath, file));
        if ('init' in mod && typeof mod.init === 'function') mod.init(client);
      }
      subdirsLoaded.push(subdir);
    }

    const standaloneInits = [
      { file: 'welcomeEvent.js', label: 'welcome' },
      { file: 'farewellEvent.js', label: 'farewell' },
      { file: 'snipeEvent.js',   label: 'snipe' },
      { file: 'jailEvents.js',   label: 'jail' },
      { file: 'verifyEvents.js', label: 'verify' },
      { file: 'twitchEvents.js', label: 'twitch' },
      { file: 'socialFeedEvents.js', label: 'feeds' },
      { file: 'lookupEvents.js', label: 'lookup' },
      { file: 'economyEvents.js', label: 'economy' },
      { file: 'gameEvents.js', label: 'games' },
      { file: 'birthdayEvents.js', label: 'birthdays' },
      { file: 'levelEvents.js', label: 'levels' }
    ];
    const standaloneLoaded = [];
    for (const { file, label } of standaloneInits) {
      const filePath = path.join(eventsPath, file);
      if (!fs.existsSync(filePath)) continue;
      const mod = require(filePath);
      if ('init' in mod && typeof mod.init === 'function') {
        mod.init(client);
        standaloneLoaded.push(label);
      }
    }

    const allModules = [...subdirsLoaded, ...standaloneLoaded].join(', ');
    printSuccess(`Event handlers ready — ${loadedEvents} events · ${allModules}`);
  } else {
    printInfo('No events directory found, skipping event loading');
  }

  printLoading('Database connection');
  const models = require('./database/schemas');

  const dbModules = {
    aiChannel:   require('./database/aiChannel'),
    aiHistory:   require('./database/aiHistory'),
    autobump:    require('./database/autobump'),
    autopost:    require('./database/autopost'),
    commandLock: require('./database/commandLock'),
    feedback:    require('./database/feedback'),
    userStats:   require('./database/userStats'),
    ignoreDb:    require('./database/ignoreDb'),
    mediaDb:     require('./database/mediaDb'),
    reminders:   require('./database/reminders'),
    lookup:      require('./database/lookup'),
    economy:     require('./database/economy'),
    profileCards: require('./database/profileCards'),
    birthdays:   require('./database/birthdays'),
    levels:      require('./database/levels'),
  };

  const COMMAND_HASH_FILE = path.join(__dirname, '.command_hash');

  async function registerCommands() {
    const MAX_SLASH = 100; // Discord's limit for global slash commands
    // Slash commands that are better as prefix commands: channel and thread toggles, music extras, panels and the
    // smaller social lookups. They all still work with the prefix. This keeps room for the 100 slash limit.
    const PREFIX_ONLY = new Set([
      'back', 'backward', 'forward', 'move', 'remove', 'clearqueue', 'autoplay',
      'hide', 'unhide', 'lock', 'unlock', 'hidethread', 'unhidethread', 'lockthread', 'unlockthread',
      'nuke', 'clone', 'nick', 'steal', 'emoji', 'json', 'imagelink', 'links', 'setprefix', 'media', 'messages',
      'boost', 'ship', 'google', 'facebook', 'snapchat', 'linkedin', 'threads', 'pinterest', 'lastfm',
      'autobump', 'autopost', 'autoreact', 'reactionroles', 'ignore', 'files', 'list',
    ]);
    const { DM_SLASH } = require('./services/dmCommands');
    let commands = [];
    for (const command of client.commands.values()) {
      const commandData = command.data.toJSON();
      if (PREFIX_ONLY.has(commandData.name)) continue;
      // DM-safe commands can be used in DMs and installed to a user; the rest stay in servers
      const dm = DM_SLASH.has(commandData.name);
      commandData.integration_types = dm ? [0, 1] : [0];
      commandData.contexts = dm ? [0, 1, 2] : [0];
      commands.push({ json: commandData, optional: !!command.slashOptional });
    }

    // Over the limit Discord rejects the WHOLE list and nothing updates. Trim instead: commands marked
    // `slashOptional` go first, then the ones loaded last. Trimmed commands still work with the prefix.
    if (commands.length > MAX_SLASH) {
      const excess = commands.length - MAX_SLASH;
      const order = [...commands.keys()].sort((a, b) => (commands[b].optional - commands[a].optional) || (b - a));
      const drop = new Set(order.slice(0, excess));
      printWarn(`${commands.length} slash commands loaded, Discord allows ${MAX_SLASH}. Skipping: ${[...drop].map((i) => '/' + commands[i].json.name).join(', ')}`);
      commands = commands.filter((_, i) => !drop.has(i));
    }
    printInfo(`Registering ${commands.length} slash commands (${commands.filter((c) => c.json.contexts.includes(1)).length} also work in DMs)`);
    commands = commands.map((c) => c.json);

    const currentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(commands))
      .digest('hex');

    let savedHash = null;
    try { savedHash = fs.readFileSync(COMMAND_HASH_FILE, 'utf8').trim(); } catch (_) {}

    if (savedHash === currentHash) {
      printInfo('Slash commands unchanged — skipping registration');
      return;
    }

    const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);
    await rest.put(Routes.applicationCommands(config.CLIENT_ID), { body: commands });
    fs.writeFileSync(COMMAND_HASH_FILE, currentHash, 'utf8');
  }

  async function gracefulShutdown(signal) {
    console.log(`\n${colors.YELLOW}⚠${colors.RESET}  Received ${signal}, shutting down gracefully...`);
    client.destroy();
    try { await models.sequelize.close(); } catch (_) {}
    process.exit(0);
  }

  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  client.on('error', (error) => {
    printError(`Discord client error: ${error.message}`);
    botLogger.logError(error, 'Discord client error', client).catch(() => {});
  });

  client.once('clientReady', async () => {
    printSuccess(`Authentication successful → ${colors.PURPLE}${client.user.tag}${colors.RESET}`);

    botLogger.init(client);

    startPresence(client);

    printLoading('Synchronizing slash commands');
    try {
      await registerCommands();
      printSuccess(`Command synchronization complete (${client.commands.size} commands)`);
    } catch (error) {
      printError(`Failed to register commands: ${error.message}`);
    }

    require('./services/restart').announce(client).catch(() => {});

    try { require('./services/music').start(client); } catch (error) { printError(`Music failed to start: ${error.message}`); }

    printInfo(`Connected to ${client.guilds.cache.size} guilds`);

    try {
      const { checkGiveaways } = require('./services/giveawayUtils');
      setInterval(() => { checkGiveaways(client); }, 10000);

      const { startBackgroundRefresh: startAnimalRefresh } = require('./services/animalApi');
      startAnimalRefresh();

      const { startBackgroundRefresh } = require('./services/pfpApi');
      startBackgroundRefresh();
    } catch (error) {
      printError('Failed to initialize database-dependent systems: ' + error.message);
    }

    printSystemReady({ tag: client.user.tag, guilds: client.guilds.cache.size, commands: client.commands.size });
  });

  try {
    await Promise.all([
      models.dbReady,
      ...Object.values(dbModules).map(m => m.dbReady)
    ]);
    printSuccess('Database initialized and all tables synced');
    // one-time copy from the old database (set OLD_DATABASE_URL to use it). Runs before the bot goes online.
    if (process.env.OLD_DATABASE_URL) {
      try { await require('./services/dbMigrate').runIfRequested(); }
      catch (err) { printError('Database copy failed, stopping so nothing is lost: ' + err.message); process.exit(1); }
    }
    // the vanity role system was removed: drop its leftover tables (does nothing once they are gone)
    try {
      const { getAll, query } = require('./database/pg');
      for (const t of await getAll("SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename LIKE 'vanity%'")) {
        await query(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`);
        printInfo(`Dropped old table ${t.tablename}`);
      }
    } catch (err) { printError('Vanity table cleanup skipped: ' + err.message); }
    await branding.load();
    await i18n.load();
  } catch (err) {
    printError('Database initialization failed: ' + err.message);
    process.exit(1);
  }

  printLoading('Discord authentication');
  try {
    await client.login(config.BOT_TOKEN);
  } catch (error) {
    printError(`Startup failed: ${error.message}`);
    process.exit(1);
  }
})();
