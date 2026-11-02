#!/bin/sh
# Tägliche Sicherung von weewx-Archiv und App-Datenbank (konsistent per SQLite-.backup),
# 14 Tage aufbewahrt. Läuft über bgbb-weather-backup.timer.
set -eu
DEST="${BACKUP_DIR:-/var/backups/bgbb-weather}"
DAY="$(date +%F)"
mkdir -p "$DEST"

sqlite3 /var/lib/weewx/weewx.sdb ".backup '$DEST/weewx-$DAY.sdb'"
sqlite3 /var/lib/bgbb-weather/app.db ".backup '$DEST/app-$DAY.db'"
gzip -f "$DEST/weewx-$DAY.sdb" "$DEST/app-$DAY.db"

find "$DEST" -name '*.gz' -mtime +14 -delete
echo "Sicherung $DAY in $DEST"
