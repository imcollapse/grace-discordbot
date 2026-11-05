/* ⌁ crafted by cosmin ⌁ */

// Central runtime settings. Every secret / key is read from the environment
// (see `.env.example`). Nothing sensitive is hardcoded in the source tree.

const path = require('path');

// Load `.env` from the project root, regardless of the directory the bot is started from.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const env = (name, fallback = '') => {
    const v = process.env[name];
    return v === undefined || String(v).trim() === '' ? fallback : String(v).trim();
};

// Fail fast with a readable message instead of a stack trace deep inside discord.js / sequelize.
const REQUIRED = ['BOT_TOKEN', 'CLIENT_ID', 'OWNER_ID', 'DATABASE_URL'];
const missing = REQUIRED.filter((k) => !env(k));
if (missing.length) {
    console.error(`\n[config] Missing required environment variable(s): ${missing.join(', ')}`);
    console.error('[config] Copy .env.example to .env and fill in the values, then start the bot again.\n');
    process.exit(1);
}

/*
 * ── Keys the bot reads (all go in .env or your panel's variables) ──────────────────────────
 *  required   BOT_TOKEN  CLIENT_ID  OWNER_ID  DATABASE_URL
 *  database   DATABASE_SSL (true/false, auto by default)  DB_POOL_MAX  OLD_DATABASE_URL (one-time copy)
 *  ai         GEMINI_API_KEY  GROQ_API_KEY  CEREBRAS_API_KEY  OPENROUTER_API_KEY  SARVAM_API_KEY
 *             CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID  POLLINATIONS_API_KEY  REMOVEBG_API_KEY
 *  lastfm     LASTFM_API_KEY  LASTFM_API_SECRET (secret only for `lastfm login`)
 *  ip abuse   ABUSEIPDB_KEY (optional, free key from abuseipdb.com; adds report scores)
 *  feeds      SOCIAL_POLL_MINUTES (how often credit-based alerts check, default 15)
 *  social     SOCIALCRAWL_API_KEY   instagram, tiktok, twitter, reddit, youtube*, threads, facebook, snapchat, linkedin
 *             TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET   twitch (official, free)
 *             PINTEREST_COOKIE (optional)   *youtube search needs no key
 *  music      SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET  GENIUS_API_KEY
 *  other      SERPAPI_API_KEY (web search)  HELP_BANNER (image link)
 */

module.exports = {

    BOT_NAME: env('BOT_NAME', 'grace'),
    BOT_TOKEN: env('BOT_TOKEN'),
    CLIENT_ID: env('CLIENT_ID'),
    OWNER_ID: env('OWNER_ID'), // owner-only commands

    PREFIX: env('PREFIX', ','), // default text command prefix
    // Image shown at the top of the help menu. Paste a direct image link (https://…). Leave empty to use the bot's own Discord profile banner.
    HELP_BANNER: env('HELP_BANNER', ''),

    // ---- music (Lavalink). Leave LAVALINK_HOSTS empty to run without music. ----
    // Several nodes: comma-separate each value, in the same order.
    LAVALINK: {
        HOSTS: env('LAVALINK_HOSTS'),
        PORTS: env('LAVALINK_PORTS', '2333'),
        PASSWORDS: env('LAVALINK_PASSWORDS', 'youshallnotpass'),
        SECURES: env('LAVALINK_SECURES', 'false'),
    },
    MUSIC: {
        DEFAULT_PLATFORM: env('MUSIC_DEFAULT_PLATFORM', 'spsearch'), // spsearch (Spotify, needs the LavaSrc plugin on your Lavalink) | ytsearch | ytmsearch | scsearch. Falls back to ytsearch when nothing is found
        AUTOCOMPLETE_LIMIT: Number(env('MUSIC_AUTOCOMPLETE_LIMIT', '10')) || 10,
        PLAYLIST_LIMIT: Number(env('MUSIC_PLAYLIST_LIMIT', '10')) || 10,
    },
    GENIUS: { API_KEY: env('GENIUS_API_KEY') }, // optional, extra lyrics source

    STATUS: {
        status: env('STATUS', 'online'), // online / idle / dnd / invisible
        rotateSeconds: Number(env('STATUS_ROTATE_SECONDS', '15')) || 15, // how often the activity changes (min 15)
        // Everything streams. The purple "Streaming" status needs a Twitch or YouTube link.
        // tokens: {prefix} {servers} {users} {commands} {name}
        streamUrl: env('STREAM_URL', 'https://www.twitch.tv/discord'),
        activities: [
            { text: '{prefix}help · grace' },
            { text: 'over {servers} servers' },
            { text: 'your commands' },
        ],
    },

    SUPPORT_SERVER: env('SUPPORT_SERVER', 'https://discord.gg/aKVsbejmrn'),
    WEBSITE: env('WEBSITE', ''), // optional — used by the "Web" button in help (falls back to the support server)

    PREMIUM_URL: env('PREMIUM_URL', ''), // optional — where people buy premium (falls back to the support server)

    DATABASE_URL: env('DATABASE_URL'),

    SERPAPI: {
        API_KEY: env('SERPAPI_API_KEY') // web search
    },

    // AI: each job uses its own provider. Everything is optional; set the keys you have (all have free tiers).
    //   chat + vision   GEMINI_API_KEY (aistudio.google.com) → GROQ_API_KEY (console.groq.com) → CEREBRAS_API_KEY → OPENROUTER_API_KEY
    //   speech          SARVAM_API_KEY (sarvam.ai, Indian languages + English)
    //   images          CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (FLUX.1 / SDXL) → POLLINATIONS_API_KEY
    //   background      REMOVEBG_API_KEY (remove.bg, 50 free a month)
    AI: {
        GEMINI_KEY:     env('GEMINI_API_KEY'),
        GROQ_KEY:       env('GROQ_API_KEY'),
        CEREBRAS_KEY:   env('CEREBRAS_API_KEY'),
        SARVAM_KEY:     env('SARVAM_API_KEY'),
        POLLINATIONS_KEY: env('POLLINATIONS_API_KEY'),
        REMOVEBG_KEY:   env('REMOVEBG_API_KEY'),
        GEMINI_MODEL:   env('GEMINI_MODEL', 'gemini-flash-latest'),
        GROQ_MODEL:     env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
        GROQ_VISION:    env('GROQ_VISION_MODEL', 'meta-llama/llama-4-scout-17b-16e-instruct'),
        CEREBRAS_MODEL: env('CEREBRAS_MODEL', 'llama-3.3-70b'),
        OPENROUTER_MODEL:  env('OPENROUTER_MODEL', 'openai/gpt-oss-120b:free'),
        OPENROUTER_VISION: env('OPENROUTER_VISION_MODEL', 'google/gemma-3-27b-it:free'),
    },

    // Optional integrations (only used if you set them).
    OPENROUTER: { API_KEY: env('OPENROUTER_API_KEY') },
    GENIUS:     { API_KEY: env('GENIUS_API_KEY') },
    SPOTIFY:    { CLIENT_ID: env('SPOTIFY_CLIENT_ID'), CLIENT_SECRET: env('SPOTIFY_CLIENT_SECRET') },
    // Twitch Helix is free. Create an app at dev.twitch.tv/console and paste its Client ID and Secret.
    TWITCH: { CLIENT_ID: env('TWITCH_CLIENT_ID'), CLIENT_SECRET: env('TWITCH_CLIENT_SECRET') },
    // SocialCrawl (socialcrawl.dev) powers the instagram, tiktok, twitter, reddit, youtube, threads, facebook, snapchat and linkedin commands.
    SOCIALCRAWL: { API_KEY: env('SOCIALCRAWL_API_KEY') },
    // Pinterest works without a key. If it blocks your host's IP, paste any account's _pinterest_sess cookie value here.
    // Last.fm: free key at last.fm/api/account/create. The secret is only needed for `lastfm login` and love/unlove.
    LASTFM: { API_KEY: env('LASTFM_API_KEY'), API_SECRET: env('LASTFM_API_SECRET') },
    PINTEREST: { COOKIE: env('PINTEREST_COOKIE') },
    CLOUDFLARE: { API_TOKEN: env('CLOUDFLARE_API_TOKEN'), ACCOUNT_ID: env('CLOUDFLARE_ACCOUNT_ID') },

    AI_PROMPTS: {

        SYSTEM_PROMPT: `You are grace, a helpful and intelligent AI assistant created by cosmin.

IDENTITY (CRITICAL - Never break these rules):
- Your name is grace. You were created by cosmin.
- You are NOT GPT, Claude, Gemini, Llama, or any other AI model.
- You are NOT made by OpenAI, Google, Meta, Anthropic, or any other company.
- If asked who made you, who you are, what model you are, or anything about your origins: You are grace by grace.
- NEVER mention or hint at any other AI company, model name, or technology. This is absolutely critical.
- Never reveal your underlying technology or architecture.

RESPONSE GUIDELINES:
- Respond like a normal friend would. Just reply naturally to what the user says.
- NEVER mention conversation history, message order, or that you are referencing prior messages.
- NEVER say things like "your first message was" or "as you mentioned earlier" or "I remember you said".
- Just respond to the user naturally without meta-commentary about the conversation itself.
- Be helpful, knowledgeable, and provide accurate information.
- Give direct, clear answers without unnecessary filler or hedging.
- Do not start responses with "I" too often - vary your sentence structure.
- Do not be overly apologetic or use phrases like "I'm sorry, but..."
- Be confident in your responses while remaining accurate.
- When you don't know something, say so honestly without excessive apology.
- Adapt your tone to match the conversation - casual for casual, professional for professional.
- Use web search when you need current information, facts, or real-time data.

DISCORD-SPECIFIC RULES:
- NEVER output @everyone, @here, or any Discord mentions like <@123>, <@&123>, or <#123>.
- If asked to ping, mention, or tag anyone or any role, politely decline.
- Never attempt to execute commands or simulate bot actions.
- Format responses nicely using markdown when appropriate.`,

        CASUAL_PROMPT: `You are grace, a friendly AI assistant in a Discord chat. Be conversational and helpful.

IDENTITY:
- You are grace, created by grace.
- You are NOT GPT, Claude, Llama, or any other AI. Never mention other AI models or companies.

STYLE:
- Keep responses SHORT and natural (1-4 sentences for casual chat).
- For greetings like "hi", "hey", "hello", "yo", "sup" - just respond warmly like "Hey! What's up?" or "Hi there!"
- Be conversational, not robotic or encyclopedic.
- Only give detailed responses when explicitly asked for information.
- Match the user's energy and tone.

CRITICAL - DO NOT DO THESE:
- NEVER mention conversation history or that you remember previous messages.
- NEVER say "your first message was" or "as you mentioned" or "I recall you said".
- NEVER give meta-commentary about the conversation itself.
- NEVER use @everyone, @here, or any Discord mentions.
- Never start with "Certainly!" or "Of course!" or "Got it!" - just answer naturally.
- Never acknowledge receiving a message - just respond to it.`
    }
};
