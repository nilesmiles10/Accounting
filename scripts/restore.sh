#!/usr/bin/env bash
# Restore helper voor nova-accounting.
#
# Usage:
#   ./restore.sh /opt/nova-accounting/backups/daily/accounting-2026-07-01.db.gz
#
# Werkt in-place:
# 1. Stopt de container
# 2. Verplaatst huidige DB naar .db.pre-restore-<timestamp>
# 3. Decomprimeert backup naar dezelfde plek
# 4. Start container weer
# 5. Health-check
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-backup.db.gz>"
  echo ""
  echo "Beschikbare backups:"
  ls -laht /opt/nova-accounting/backups/daily/ 2>/dev/null | head -10
  exit 1
fi

BACKUP="$1"
if [ ! -f "$BACKUP" ]; then
  echo "FAIL: backup bestaat niet: $BACKUP"
  exit 1
fi

CONTAINER="${BACKUP_CONTAINER:-nova-accounting}"
VOLUME_ROOT=$(docker volume inspect nova-accounting_accounting-data --format '{{ .Mountpoint }}')
DB_PATH="$VOLUME_ROOT/accounting/accounting.db"
STAMP=$(date -u +%Y%m%d-%H%M%S)

echo "Restore van: $BACKUP"
echo "Naar: $DB_PATH"
echo ""
read -p "Doorgaan? De huidige DB wordt bewaard als .pre-restore-$STAMP. [y/N] " -n 1 -r
echo ""
[[ ! $REPLY =~ ^[Yy]$ ]] && { echo "afgebroken"; exit 0; }

# 1. Stop container zodat SQLite lockjes vrijkomen
echo "→ container stoppen..."
docker stop "$CONTAINER"

# 2. Bewaar huidige DB
if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "${DB_PATH}.pre-restore-$STAMP"
  # Backup ook WAL + SHM als die bestaan
  [ -f "${DB_PATH}-wal" ] && cp "${DB_PATH}-wal" "${DB_PATH}-wal.pre-restore-$STAMP"
  [ -f "${DB_PATH}-shm" ] && cp "${DB_PATH}-shm" "${DB_PATH}-shm.pre-restore-$STAMP"
  # Verwijder de huidige (inclusief WAL/SHM) zodat SQLite geen conflict heeft
  rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"
  echo "→ huidige DB bewaard als ${DB_PATH}.pre-restore-$STAMP"
fi

# 3. Decompress + place
mkdir -p "$(dirname "$DB_PATH")"
gunzip -c "$BACKUP" > "$DB_PATH"
echo "→ backup ge-decomprimeerd naar $DB_PATH"

# 4. Integriteitscheck met sqlite3 (of skip als niet aanwezig — de app
#    doet 't ook bij opstarten)
if command -v sqlite3 >/dev/null; then
  RESULT=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>&1)
  if [ "$RESULT" != "ok" ]; then
    echo "FAIL: integrity_check op restored DB gaf: $RESULT"
    echo "Zie: ${DB_PATH}.pre-restore-$STAMP om terug te draaien"
    exit 1
  fi
  echo "→ integrity_check ok"
fi

# 5. Start container + health check
echo "→ container starten..."
docker start "$CONTAINER"

echo "→ wachten op health..."
for i in {1..30}; do
  if docker exec "$CONTAINER" wget -q --spider http://0.0.0.0:3336/api/health 2>/dev/null; then
    echo ""
    echo "✓ restore compleet en health check groen"
    echo ""
    echo "Rollback indien nodig:"
    echo "  docker stop $CONTAINER"
    echo "  mv ${DB_PATH}.pre-restore-$STAMP $DB_PATH"
    echo "  docker start $CONTAINER"
    exit 0
  fi
  sleep 2
done

echo "WARN: container is up maar health check antwoordde niet binnen 60s"
echo "Check logs: docker logs $CONTAINER --tail 50"
exit 1
