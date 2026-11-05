# Moving the database off Neon (panel hosting, no terminal)

The bot copies the data itself. You only edit two settings in your panel and restart.

## 1. Pick the new database

**Free: Supabase.** 500 MB (same size as Neon free) and no compute-hour cap. It only pauses projects that have no activity for a week, and the bot is always active.
It goes read-only if the database passes 500 MB, so check your size first (Neon dashboard → Storage).

**Paid, about $5–8 a month, if you want zero worry:** a small managed Postgres on Railway, Render, or Neon's paid plan. Same steps below, only the connection string differs.

**Your own server:** a VPS that you can SSH into, plus `docker-compose.postgres.yml`. Best performance, but you would run the bot there too.

## 2. Create it on Supabase

1. supabase.com → New project. Pick the region closest to your bot. Set a database password with letters and numbers only (symbols break the URL).
2. Click **Connect** at the top of the project. Choose the **Session pooler** string (it works over IPv4, which panel hosts usually need). It looks like:
   `postgres://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-xx.pooler.supabase.com:5432/postgres`
3. Replace `[YOUR-PASSWORD]` with your password. This is your **new URL**.

## 3. Get the old URL

Neon dashboard → your project → **Connect** → turn **Connection pooling off** → copy the string. This is your **old URL**. It is the value you already have in `DATABASE_URL`.

## 4. Switch in the panel

Open your server in the panel. Where your settings live depends on how your host set it up. Either the **Startup** tab (variables) or a `.env` file in **Files**.

| Setting | Value |
|---|---|
| `DATABASE_URL` | the **new** URL |
| `OLD_DATABASE_URL` | the **old** Neon URL |

Restart the bot. In the console you will see:

```
[migrate] Copying data from the old database. The bot is not online yet, so nothing changes while this runs.
[migrate]   <table>   123 / 123
...
[migrate] Done. 4821 rows copied across 96 tables. Remove OLD_DATABASE_URL and restart.
```

The bot stays offline while it copies, so no data is written in the meantime. It usually takes under a minute.

- If any table is incomplete, the bot stops instead of starting with missing data. Fix the cause (the error is printed) and restart. Rows already copied are skipped, so retrying is safe.
- The copy is recorded in the new database, so it never runs twice.

## 5. Finish

1. Delete the `OLD_DATABASE_URL` setting and restart the bot.
2. Try a few commands that read and write data (profile, a leaderboard, a server setting).
3. Keep the Neon project for a week as a fallback. To go back, set `DATABASE_URL` to the Neon string and restart.

## Good to know

- If Neon has **already stopped the database** because the monthly limit was reached, the copy cannot read it. Wait for the monthly reset (Neon dashboard shows the date), or upgrade Neon for one month, copy, then cancel.
- Back up now and then. Supabase free has no automatic backups. From a computer with Postgres tools: `pg_dump --format=custom "<new URL>" > backup.dump`.
- `DATABASE_SSL=false` forces SSL off and `true` forces it on. By default it turns itself off for local addresses.
- `DB_POOL_MAX` sets how many connections the bot opens (default 10). Keep it at 10 or less on free plans.

## With a terminal (optional)

```bash
echo "POSTGRES_PASSWORD=long-random-password" > .env
docker compose -f docker-compose.postgres.yml up -d
# then DATABASE_URL=postgres://grace:long-random-password@127.0.0.1:5432/grace and OLD_DATABASE_URL=<Neon>, as above
tools/db/backup.sh     # nightly backups, add to cron
```
