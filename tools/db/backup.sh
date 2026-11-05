#!/usr/bin/env bash
# grace · nightly backup. Keeps the last 7 dumps.
#   crontab -e  →  15 3 * * *  /path/to/bot/tools/db/backup.sh
# Restore:  pg_restore --clean --if-exists -d "$DATABASE_URL" backups/grace-YYYY-MM-DD.dump
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
DIR="${BACKUP_DIR:-$(dirname "$0")/../../backups}"
mkdir -p "$DIR"
pg_dump --format=custom --no-owner "$DATABASE_URL" > "$DIR/grace-$(date +%F).dump"
ls -1t "$DIR"/grace-*.dump | tail -n +8 | xargs -r rm --
echo "backup ok: $(ls -1t "$DIR"/grace-*.dump | head -1)"
