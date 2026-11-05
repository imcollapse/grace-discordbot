# Grace

A multipurpose Discord bot built on discord.js v14: moderation, security, levels, economy, music, utilities and server analytics, with a modern Components V2 interface.

Default prefix: `,` (configurable per server). Most commands also work as slash commands.

## Features

- **Moderation and security**: antinuke, automod, logging, locking and hiding channels and threads, purge, nuke, tickets
- **Community**: levels and rank cards, profiles, welcome and farewell cards, giveaways, birthdays, reaction roles, family and ship, voicemaster
- **Economy and fun**: economy, roleplay, todo, reminders, leaderboards
- **Music**: Lavalink playback through Poru with queue, filters, playlists, favorites, autoplay and lyrics
- **Analytics**: `stats` with server overview, activity, messages, voice, membership and per-member views
- **Social lookups**: Instagram, TikTok, Twitter, Reddit, YouTube, Twitch, GitHub, Pinterest and more
- **AI chat and tools**: chat with provider fallback, image generation, text to speech and background removal (all optional)
- **Localization**: multiple languages, selectable per server

## Requirements

- Node.js 20 or newer
- PostgreSQL 13 or newer
- A Lavalink server (optional, only for music)

## Setup

```bash
git clone <your-fork-url> grace
cd grace
npm install
cp env.example .env
```

Fill in `.env`, then start the bot:

```bash
npm start
```

Tables are created automatically on first start. On panel hosts such as Pterodactyl, set the same values as startup variables and use `npm start` as the start command.

## Configuration

Required:

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Bot token from the Discord Developer Portal |
| `CLIENT_ID` | Application ID |
| `OWNER_ID` | Discord user ID of the bot owner |
| `DATABASE_URL` | PostgreSQL connection string |

Optional:

| Variable | Description |
|---|---|
| `DATABASE_SSL` | `true` or `false`; empty detects automatically |
| `DB_POOL_MAX` | Maximum database connections |
| `LAVALINK_HOSTS`, `LAVALINK_PORTS`, `LAVALINK_PASSWORDS` | Lavalink nodes; leave empty to run without music |
| `MUSIC_DEFAULT_PLATFORM` | `spsearch` (needs LavaSrc) or `ytsearch` |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY` | AI chat providers, used in fallback order |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `POLLINATIONS_API_KEY` | Image generation |
| `SARVAM_API_KEY`, `REMOVEBG_API_KEY` | Text to speech, background removal |
| `SOCIALCRAWL_API_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Social lookups |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `GENIUS_API_KEY`, `SERPAPI_API_KEY` | Music metadata, lyrics, search |
| `ABUSEIPDB_KEY` | Abuse scores for the ip command |
| `HELP_BANNER` | Image link shown at the top of the help menu |

See [`env.example`](env.example) for the complete list.

## Database

Any PostgreSQL works. See [DATABASE.md](DATABASE.md) for moving between hosts, `docker-compose.postgres.yml` for a local instance, and `tools/db/backup.sh` for dumps.

## Project structure

```
src/
  bootstrap.js     entry point
  events/          Discord event handlers
  modules/         commands (dual = prefix and slash, text, interactions)
  services/        shared logic, cards, music, AI
  database/        schema and queries
  localization/    language files
  settings/        configuration
  media/           fonts, badges, emoji data
tools/             i18n checks, database tools
```

## Credits

Created and maintained by [Cosmin](https://discord.com/users/1524312245046218792) ([cosmin.bond](https://cosmin.bond)).

Some bugs were fixed with the help of Claude, an AI assistant made by Anthropic.

Third party:

- Music commands are adapted from AeroX Music
- Card fonts Courier Prime and Space Mono are licensed under the SIL Open Font License; license files are in `src/media/fonts/cards/`

## License

Released under the [ISC License](LICENSE).
