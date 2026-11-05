// Release notes shown by the `updates` command, newest first.
// To ship a new version: add an object at the TOP of the list. `build` is any number that goes up.
// Sections (all optional): added · changed · fixed · removed. The dropdown shows the newest 25.

module.exports = [
    {
        version: '2.3.0', build: 2300, date: '2026-11-02', title: 'Grace',
        added: [
            'The bot is now **Grace**. The economy stock is now "Grace Corp" (`grace`) and existing shares move over automatically.',
            '`antiraid` has a new look with four modules to open one by one: **Join flood**, **New accounts**, **Default avatars** (new: act on members who join without a profile picture) and **Raid mode**.',
        ],
        changed: [
            '**Cards restyled.** One plain font and no frames, rings, diamonds or divider lines on every card. Profile cards use soft colours with a gentle fade (Lavender, Blush, Sage, Sky, Butter, Peach, Forest, Plum, Navy, Ink) over a lightly blurred copy of your avatar or banner. Avatars are plain circles with no border. The music card, rank card, stats, welcome, ship and family cards share one new look: a soft tinted fade, small corner brackets, typewriter titles and small spaced labels. The music card shows a waveform progress bar. Use the new **Colour** button in `profileedit` to set your own hex colour; your rank card follows it. The profile form has new, simpler hints.',
            '**`stats` redesigned.** Plain font, no frame, bar charts per day. It opens on **Server overview** and has three dropdowns: **Lookback** (24 hours, 7, 14 or 30 days), **View** (overview, activity, messages, voice, membership, user analytics) and a **member picker** that opens that person\'s analytics with rank, messages, voice and a snapshot.',
            '`antinuke` and `automod` have a new look. Protections and filters show a status list, open one to see its status, response and limit, and jump to another from a menu.',
            'Emojis were cleaned up and renamed so each name says what it is, like `arrow_left`, `toggle_on` and `success`. Unused ones were removed. See `media/emojis.md`.',
        ],
    },
    {
        version: '2.2.0', build: 2200, date: '2026-11-01', title: 'Levels',
        added: [
            '**Levels.** Members earn XP for chatting (and optionally for time in voice), climb levels and unlock roles. Turn it on with `level setup`. See your card with `rank` or `/level rank`, the server board with `level top` (or `leaderboard levels`), and everything configured with `level info`.',
            'A new **rank card** with a progress ring around your avatar, your level, server rank, messages, voice time and total XP. It uses the colour you picked for your profile.',
            '**Level-up messages you design yourself.** `level setup` works like the welcome panel: pick a channel (or the channel they chatted in, or a DM), then choose **Default**, **Normal Message**, **Embed** or **Container**. The Embed editor shows a live preview, and buttons open forms for the title, description, colour, images, author, footer and fields, with variables like `{user}`, `{level}`, `{rank}`, `{xp.total}` and `{reward}`.',
            '**Reward roles** (`level addreward 5 @role`, keep them all or only the highest), **XP boosts** for roles and channels (`level boost @role 2`), **ignored** channels and roles (`level ignore #spam`), and admin tools to `set`, `reset` and `sync`. Members who rejoin get their roles back.',
        ],
    },
    {
        version: '2.1.0', build: 2100, date: '2026-10-31', title: 'Reze',
        changed: [
            'The bot is now **Reze**. Names, help, premium and the AI persona all use the new name. The economy stock "Evoke Corp" is now "Reze Corp" (`reze`) and existing shares move over automatically.',
        ],
        fixed: [
            '`steal` no longer crashes when used in a DM.',
            'Several commands shared the same short name, so one of them silently never ran. Now `roll` is the dice, `weather` has no `w` alias (it stays with `wikipedia`), `fb` is Facebook, `snap` is Snapchat, `leave` is the farewell command, `ar` is auto reactions, `pp` is the size command, and `poke` is the roleplay action (the Pokédex is `pokemon`, `pokedex` or `dex`).',
            'Birthday wishes keep going for the other servers when one server has a problem.',
        ],
    },
    {
        version: '2.0.0', build: 2000, date: '2026-10-29', title: 'Evoke',
        added: [
            'The bot is now **Evoke**. Names, help, premium and the AI persona all use the new name.',
            'Evoke now works in **DMs** and can be installed to your account. Use slash commands in DMs, like `/avatar`, `/userinfo`, `/remind`, `/todo`, `/ai`, `/lookup`, `/conversion` and the new `/tools`. Server-only commands don\'t show up there.',
            '**16 new tools that need no server**, all in one slash command `/tools` (and with the prefix in servers): `choose`, `roll`, `8ball`, `timestamp`, `color`, `password`, `qr`, `weather`, `tz`, `currency`, `base64`, `reverse`, `snowflake`, `joke`, `advice` and `fact`.',
            '**Mini games with `/game`** that work in DMs, on a user install and in servers: tic tac toe, connect four, rock paper scissors (best of 3), quick draw and trivia. Pick an `opponent` and they get an accept button, or leave it empty to play against evoke (quick draw needs an opponent, trivia can be solo).',
            '**20 platform commands (prefix only):** `minecraft` (server status, Bedrock, player, skin, uuid), `steam` (game, user, players, top, sales), `kicktv` (channel, live), `roblox`, `chess` (chess.com), `lichess`, `bluesky`, `pokemon`, `anime`, `manga`, `epic` (free games), `npm`, `pypi`, `docker` and `ghuser`. No API keys needed. `kick` stays the moderation command, so the Kick platform is `kicktv`.',
            '`av` is now an alias for `avatar`.',
            '**Profile card you design yourself.** `profileedit` (or `profile edit`) opens the editor: **Edit Profile** (tagline, short description, location, age, profession), **Banner** (upload a picture straight from your device) and a theme menu. The card has your banner, avatar, badges, status and three detail tiles, and `profile` shows it with your social buttons.',
            '**Birthdays.** Save yours with `birthday set 14 mar` (year optional) from a server or a DM. Admins turn wishes on with `birthday enable [#channel]` and can change the channel, text, pinging and time zone. The bot posts an embed on the day. `birthday upcoming` lists the next ones in the server.',
        ],
        changed: [
            'Every card has a new layout: ship, welcome and goodbye banner, now playing (card and progress bar), family proposal / marriage / adoption / profile / tree, server stats charts and the captcha. Clean sans fonts, true blacks and full colours, with arched portraits and hairline frames.',
            '`lock`, `unlock`, `hide` and `unhide` (and the thread versions) now reply with one short line and an Undo button.',
            'After `nuke` the new channel gets a short plain message instead of a container.',
            'The command count is shown as the exact number, without a plus sign.',
            'Fewer slash commands. Channel and thread toggles, music extras (back, forward, move, remove, clearqueue, autoplay), small social lookups and a few panels are now prefix only, and still work exactly the same with the prefix.',
            'Only DM-safe slash commands show up in DMs and on user installs. Server commands show in servers only.',
            'The status now always shows as **Streaming** (still with the mobile icon). Set `STREAM_URL` to change the link.',
            'The economy stock "Hope Corp" is now "Evoke Corp" (`evoke`). Existing shares move over automatically.',
        ],
    },
    {
        version: '1.23.0', build: 1230, date: '2026-10-28', title: 'Economy',
        added: [
            'A full economy that every server can turn on with `economy enable`. Your money, items and stats follow you across every server, but a server must have the economy on before its members can earn or spend. `balance` and `portfolio` work everywhere.',
            '**Earn** with `daily` (grows with your streak), `weekly`, `work` (eight jobs, each shift counts towards a promotion), `beg`, `crime` and `rob`. Rewards are small on purpose: a shift pays 14 to 30 at the start.',
            '**Fish and mine** for loot with a fishing rod or a pickaxe from the shop. Tools can break. Sell what you find with `sell`.',
            '**Bank** with `deposit` and `withdraw`. Bank money can\'t be robbed, earns daily interest and has a limit that you can raise with a bank note.',
            '**Games** `gamble`, `coinflip` and `slots`, with a bet limit that admins can change using `economy maxbet`.',
            '**Shop** with a fishing rod, pickaxe, laptop, padlock, energy drink, lucky clover and bank note. Use `buy`, `sell`, `use` and `inventory`.',
            '**Market** with four pretend companies. Prices move every hour. Trade with `invest` and check `portfolio`.',
            '`richest` shows the richest members. `balance` shows wallet, bank, job and rank.',
            'Admins use `economy` to turn it on or off, rename the currency, set the bet limit, add or remove money, and turn on chat drops (a purse that the first person to press Claim keeps).',
            '**Server shop for premium servers:** admins add roles and items with prices and stock using `shop add role`, `shop add item`, `shop edit` and `shop remove`. Servers without premium use the bot\'s own shop.',
            '**User Premium** now pays 1.5x on `daily`, `weekly`, `work`, `beg`, `crime` and chat drops, waits 25% less between earning commands, earns more bank interest and has a bigger bank.',
        ],
    },
    {
        version: '1.22.0', build: 1220, date: '2026-10-27', title: 'Three premium plans',
        added: [
            '**Server Premium** unlocks everything extra for one server, branding included, and gives its owner the User Premium perks.',
            '**User Premium** follows you everywhere: family size of 15, 1.5x economy rewards once the economy ships, no captcha on lookup, vanity and usernames, and more snapshot slots.',
            '**Branding Premium** unlocks only the per-server bot avatar, banner and bio.',
            '`premium me` shows your own plans. The bot owner can give or remove any plan with `premium add` and `premium remove`, and see everyone with `premium list`.',
            'Premium now has its own custom emoji instead of symbols.',
            'Commands with premium benefits (embeds, containers, welcome and snapshots) show a small message with a Get premium button under the reply. It only shows to people who do not have the plan, and not more than once a minute.',
        ],
        changed: [
            'Premium and the lookup cards use small `-#` lines, **bold** labels and quoted blocks.',
        ],
        fixed: [
            'The welcome banner variable could make the embed and container builders fail with "Unknown interaction". The picture is now drawn after the reply, and finished pictures are kept for ten minutes.',
        ],
    },
    {
        version: '1.21.0', build: 1210, date: '2026-10-26', title: 'New now playing card',
        added: [
            'A new now playing card: cover art, the title as a link, and a progress bar drawn in a colour taken from the cover. It shows pause, loop, autoplay and volume under the bar.',
            'Buttons for pause or resume, skip, like and refresh, plus "Open music controls". The refresh button updates the bar to the current position.',
            '"Open music controls" opens a private panel: back, pause, skip and stop; queue, lyrics, loop, shuffle and autoplay; like, volume down and up, and filters; liked songs and recently played.',
        ],
        changed: [
            'Song searches now use Spotify first and fall back to YouTube when nothing is found. Your Lavalink needs the LavaSrc plugin with Spotify keys for this, otherwise searches use YouTube as before.',
            'The like button adds or removes the current song from your liked songs, and the close button removes the card without stopping the music.',
        ],
    },
    {
        version: '1.20.0', build: 1200, date: '2026-10-26', title: 'IP, domain and lookup tools',
        added: [
            '`ip` commands: lookup, whois, abuse, asn, ptr, ports, subnet and ping.',
            '`domain` commands: lookup, dns, ssl, ip, availability and sub (subdomains).',
            '`lookup` opens a panel of released usernames and vanity codes with search, length and character filters, sorting and match modes. `vanity` and `usernames` open the same panel on their own tab.',
            '`vanity <code>` checks if a vanity invite is in use, and `vanity watch <code>` sends you a DM when it frees up.',
            '`usernames <name>` checks the format and what the bot has seen of a username.',
            'A quick captcha guards lookup, vanity and usernames. Solving it lasts 12 hours, and premium skips it.',
        ],
    },
    {
        version: '1.19.0', build: 1190, date: '2026-10-26', title: 'Welcome banners',
        added: [
            'Banner pictures like "you\'re the 194th member" with a MEMBER #194 badge. Use `{banner}` as an image link in a welcome, embed or container (thumbnail, large image or media).',
            'Colours: `{banner.red}` `{banner.blue}` `{banner.purple}` `{banner.green}` `{banner.gold}` `{banner.pink}` `{banner.dark}`. `{banner}` alone picks a colour from the member\'s avatar, which is also blurred into the background.',
            '`{banner.bye}` is a goodbye version for farewell messages.',
        ],
    },
    {
        version: '1.18.1', build: 1181, date: '2026-10-26', title: 'Safer mentions and VoiceMaster fixes',
        changed: [
            'The bot no longer welcomes or says goodbye to other bots.',
            'Everything the bot repeats from users can no longer ping @everyone, @here or roles. Role pings you set up yourself (tickets, alerts, feedback) still work.',
        ],
        fixed: [
            '`feedback setup` could not send the panel because of too many buttons in one row.',
            'Join-to-Create rooms now delete when only bots are left, bots in them are disconnected, and leftover rooms are cleaned up on restart.',
        ],
    },
    {
        version: '1.18.0', build: 1180, date: '2026-10-26', title: 'Better feedback',
        added: [
            'The feedback panel now shows the server\'s average rating and a star breakdown, and has 1 to 5 star buttons. It updates itself with every new review.',
            'Reviews are saved. `feedback stats` shows the average, how many gave each star and the latest reviews.',
            'Feedback setup is a single screen with the review channel, a log channel and an optional role to ping on new reviews.',
            'One review per person per hour, and pictures must be real image links.',
        ],
        changed: [
            'Review cards are cleaner: stars, the quote, who wrote it and when, plus the review number.',
            'Text inside a review can no longer ping @everyone or roles.',
        ],
        fixed: [
            '`botinfo` no longer notifies the owner when it shows the owner\'s name.',
        ],
    },
    {
        version: '1.17.0', build: 1170, date: '2026-10-26', title: 'Last.fm and alerts',
        added: [
            '`lastfm` (aliases `fm`, `lf`): now playing card with your plays and a Love button, recent tracks, top artists, tracks and albums by period, profile, artist, track and album info, loved tracks and a 2x2 to 6x6 album chart.',
            '`whoknows` (`wk`, `wkt`, `wka`) ranks who in the server plays an artist, track or album, and `lastfm leaderboard` ranks scrobbles. Link with `lastfm login` or `lastfm set <name>`.',
            '`notify` sends new-post alerts: YouTube uploads, Reddit posts, Instagram, TikTok and X posts, plus Twitch going live. Set a channel and an optional role ping per account.',
        ],
    },
    {
        version: '1.16.0', build: 1160, date: '2026-10-25', title: 'More platforms',
        added: [
            '`youtube` now also shows channels, uploads, shorts, single videos, top comments and trending. Plain `youtube <query>` still searches for free.',
            '`threads`: profiles, posts, single posts, replies, search and accounts.',
            '`facebook` (alias `fb`): pages, posts, reels, single posts, public groups and search.',
            '`snapchat` (alias `snap`): public profiles and Spotlight comments.',
            '`linkedin` (alias `li`): public profiles, company pages and their posts.',
            'Owner command `socialcredits` shows how many lookups are left.',
        ],
    },
    {
        version: '1.15.0', build: 1150, date: '2026-10-25', title: 'Cleaner look, Halloween ended',
        changed: [
            'Containers no longer have a coloured stripe. Success, error and warning replies are plain containers too.',
        ],
        removed: [
            'The Halloween event is over: its commands, spawns, shop, quests and profile extras are gone.',
        ],
    },
    {
        version: '1.14.0', build: 1140, date: '2026-10-25', title: 'Instagram, TikTok, X and Reddit',
        added: [
            '`instagram` (alias `ig`): profiles, posts, reels, single posts, downloads, account search and hashtags.',
            '`tiktok` (alias `tt`): profiles, videos, downloads, search, hashtags, trending and live status.',
            '`twitter` (aliases `x`, `twt`): profiles, posts, media, single posts, downloads and search.',
            '`reddit` (alias `rd`): browse subreddits by hot, new or top, read posts, search and find communities.',
            'Posts open in a viewer with ◀ ▶, Open and Save file buttons, and load more pages as you go. Everything also works as a slash command.',
        ],
    },
    {
        version: '1.13.0', build: 1130, date: '2026-10-25', title: 'Twitch',
        added: [
            '`twitch user`, `live`, `top`, `game`, `games` and `search` show channels, streams and categories from the official Twitch API.',
            '`twitch clips`, `videos`, `schedule` and `emotes` page through a streamer\'s content.',
            '`twitch notify add <name> [#channel] [@role]` posts a card when a streamer goes live. Everything also works as `/twitch`.',
        ],
    },
    {
        version: '1.12.0', build: 1120, date: '2026-10-25', title: 'Pinterest',
        added: [
            '`pinterest search` browses pins page by page with ◀ ▶, an Open button and a Save file button. `pinterest <words>` works too.',
            '`pinterest pin`, `download` and `related` take pinterest.com or pin.it links. Videos play and download too.',
            '`pinterest user`, `pins`, `boards` and `board` show profiles, newest pins and boards. Boards can be opened from a menu.',
            '`pinterest random` gives one random pin. Everything also works as `/pinterest`.',
        ],
    },
    {
        version: '1.11.0', build: 1110, date: '2026-10-24', title: 'Better AI, image tools',
        added: [
            '`image <effect>` edits pictures: grayscale, invert, sepia, blur, pixelate, sharpen, emboss, edges, posterize, threshold, solarize, brightness, contrast, saturate, vignette, flip, mirror, rotate, resize, circle, round, glitch and deepfry.',
            '`image caption top|bottom` makes memes, and `image removebg` cuts out the background.',
            'Effects work on an attachment, a replied image, a link, a mentioned member\'s avatar or your own.',
        ],
        changed: [
            'Chat now runs on Gemini, with Groq, Cerebras and OpenRouter as backups. Each has a free tier.',
            '`ai tts` now uses Sarvam voices and speaks Hindi, English, Tamil, Telugu, Bengali and more. The language is picked from the text.',
            '`ai imagine` now uses FLUX.1 and SDXL on Cloudflare, with Pollinations as a backup.',
            '`ai analyse` reads images with a vision model.',
        ],
    },
    {
        version: '1.10.0', build: 1100, date: '2026-10-24', title: 'Antiraid, lockdown and permission guard',
        added: [
            '`antiraid` watches joins. A burst of members in a few seconds starts raid mode: the burst and every new joiner get kicked, banned or timed out, the server can lock down and the verification level goes up. Everything is undone when it ends. It can also remove accounts younger than a set age.',
            '`lockdown` stops everyone from talking in one step, with a timer, a reason and channels that stay open. Unlocking restores every channel exactly as it was. New channels are locked too.',
            '`permguard` puts powerful permissions back where you approved them. If anyone, the owner included, gives Administrator, Manage Server, Manage Roles and similar to a role, or hands out a role that has them, the bot reverts it. Strangers are punished too.',
            'The permission guard has a Pause button for when you really want to change something, and Strict mode can be turned off to exempt the owner, extra owners and trusted members.',
            'Channels and roles deleted by strangers are recreated automatically.',
        ],
    },
    {
        version: '1.9.0', build: 1090, date: '2026-10-24', title: 'Verification and Join DM',
        added: [
            '`verify setup` opens a panel for captcha verification. New members get the Unverified role, see only the verify channel and are pinged there.',
            'They press Verify, read a captcha card and type the code in a form. Wrong codes use up tries, and the code changes every time.',
            'Auto setup creates the role and channel and hides every other channel. New channels are hidden automatically.',
            '`verify approve`, `verify pending`, `verify send`, `verify sync` and an optional kick for members who never verify.',
            '`joindm setup` sends every new member a DM made of text, a saved embed or a saved container.',
            'The DM always has a button reading "Sent from <server>". `joindm link` points it at your invite.',
        ],
    },
    {
        version: '1.8.0', build: 1080, date: '2026-10-23', title: 'AI rework',
        added: [
            '`ai prompt` answers in a clean card with the model, time taken and page count, plus ◀ ▶ buttons and a Reply button to keep the conversation going.',
            '`ai imagine` draws images with a Regenerate button. Add `--landscape`, `--portrait` or `--turbo`.',
            '`ai tts`, `ai translate`, `ai summarize` and `ai clear`. `analyse` uses the new card too.',
        ],
        changed: [
            'The AI now runs on a free model, so no API key is needed.',
            '`imagine` and `/tts` moved under `ai`, which frees a slash command slot.',
        ],
    },
    {
        version: '1.7.1', build: 1071, date: '2026-10-23', title: 'Help reference',
        changed: [
            '`help <anything>` now always shows the reference card: usage, aliases, parameters and permissions. This covers every command, group, module and category, in prefix and slash.',
            'The category menu opens only for a plain `help`.',
        ],
    },
    {
        version: '1.7.0', build: 1070, date: '2026-10-23', title: 'Honeypot',
        added: [
            '`honeypot setup` creates a trap channel with a pinned warning and a live Caught counter.',
            'Anyone who posts in it is punished automatically: ban, softban, kick or timeout, chosen with `honeypot action`.',
            'Bans and softbans also wipe the last hour of the user\'s messages. The owner and administrators are never touched.',
            '`honeypot add` arms an existing channel, `honeypot log` logs every catch, and `honeypot status` shows the numbers.',
        ],
    },
    {
        version: '1.6.0', build: 1060, date: '2026-10-23', title: 'Release notes',
        added: [
            '`updates` shows what changed in every version, with a dropdown and Older / Newer buttons. Works as a slash and prefix command.',
        ],
    },
    {
        version: '1.5.1', build: 1051, date: '2026-10-23', title: 'Slash command slots',
        changed: [
            'Thirteen music commands are now prefix-only: autoplay, back, backward, clearqueue, disconnect, filter, forward, loop, move, remove, seek, shuffle and volume.',
            '`/family` is registered with the rest of the commands again.',
        ],
    },
    {
        version: '1.5.0', build: 1050, date: '2026-10-23', title: 'Snapshots',
        added: [
            'Snapshots back up a whole server: roles, categories, channels, permissions, name, icon, banner, settings and emojis.',
            'Every snapshot gets a backup ID. Load it into the same server or any other one you own.',
            'Free users get 2 snapshot slots and premium users get 5.',
            'Only the server owner can use snapshots, and they can let admins use them with `snapshot access`.',
        ],
    },
    {
        version: '1.4.0', build: 1040, date: '2026-10-22', title: 'Jail',
        added: [
            '`jail setup` creates a Jailed role and a private jail channel in one click.',
            '`jail @user [time] [reason]` takes a member\'s roles and sends them to jail, with an optional timer.',
            '`jailed` lists everyone in jail. `unjail` lets them out and gives their roles back.',
            'Jailed members stay jailed if they leave and rejoin, and new channels are hidden from them automatically.',
        ],
    },
    {
        version: '1.3.2', build: 1032, date: '2026-10-21', title: 'Voice status polish',
        changed: [
            'The voice channel status now has just two states, Playing and Idle, both with custom emojis.',
        ],
    },
    {
        version: '1.3.1', build: 1031, date: '2026-10-21', title: 'Cleanup',
        fixed: [
            'Going over Discord\'s slash command limit no longer stops every command from registering. The extras are skipped and listed in the console.',
            'Server icons are no longer required for the premium screens.',
        ],
        removed: ['The vanity roles system, and its leftover database tables.'],
    },
    {
        version: '1.3.0', build: 1030, date: '2026-10-21', title: '24/7 music',
        added: [
            '`247 enable` keeps the bot in your voice channel around the clock, even when it is empty. It rejoins after restarts, kicks and moves.',
            'The voice channel status follows the music while it plays.',
        ],
        changed: [
            '`stop` and `disconnect` keep the bot in the channel while 24/7 is on.',
        ],
    },
    {
        version: '1.2.1', build: 1021, date: '2026-10-21', title: 'Premium fixes',
        fixed: [
            '`premium` no longer fails in servers that have no icon.',
        ],
    },
    {
        version: '1.2.0', build: 1020, date: '2026-10-21', title: 'Premium',
        added: [
            'Premium servers can change the bot\'s avatar, banner and bio per server.',
            'Premium gives 60 saved embeds and containers instead of 25, and up to 10 extra welcome channels with their own messages and auto-delete.',
            'Server owners get 15 family members and 1.5x Halloween candy.',
            '`premium trial` gives the server owner a free 3-day trial. The owner gets a notice when it ends.',
            '`premium add`, `remove` and `status` are for the bot owner.',
        ],
    },
    {
        version: '1.1.1', build: 1011, date: '2026-10-21', title: 'Family polish',
        changed: [
            'Family cards use a softer cotton-candy and sky-blue look.',
            'Errors, confirmations and settings in `/family` are only visible to you.',
        ],
    },
    {
        version: '1.1.0', build: 1010, date: '2026-10-20', title: 'Marriage and family',
        added: [
            '`family marry`, `divorce`, `adopt`, `disown`, `runaway` and `leave`.',
            '`family profile` and `family tree` draw your family as an image.',
            '`family relationship` shows how two people are related.',
            '`family proposals` and `family adoptions` choose who can reach you.',
            'Up to 5 children, or 15 with premium.',
        ],
    },
    {
        version: '1.0.2', build: 1002, date: '2026-10-19', title: 'Bot info',
        changed: [
            '`botinfo` has a new layout with Overview, System and Credits pages.',
        ],
    },
    {
        version: '1.0.1', build: 1001, date: '2026-10-18', title: 'Halloween polish',
        changed: [
            'Every Halloween reply is now a card, and Halloween has its own category in the help menu.',
        ],
        fixed: [
            'The trick-or-treat cooldown showed a huge, wrong time.',
        ],
    },
    {
        version: '1.0.0', build: 1000, date: '2026-10-17', title: 'Halloween',
        added: [
            'The Halloween event: trick-or-treating, nightly quests, the Haunted Pass, a shop, crates and a wardrobe.',
            'Halloween badges, titles, frames and themes show on your profile card.',
        ],
    },
];
