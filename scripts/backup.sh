#!/usr/bin/env bash
# Host-side backup wrapper voor nova-accounting.
#
# Draait binnen host-cron op de VPS. Roept de node-backup binnen de
# container aan, comprimeert, past retentie toe en synct optioneel naar
# een rclone remote (S3/B2/Storj/etc).
#
# Setup: zie deploy/BACKUP.md.
set -euo pipefail

CONTAINER="${BACKUP_CONTAINER:-nova-accounting}"
HOST_BACKUP_DIR="${BACKUP_DIR:-/opt/nova-accounting/backups}"
DAILY_RETENTION_DAYS="${BACKUP_DAILY_RETENTION:-30}"
MONTHLY_RETENTION_MONTHS="${BACKUP_MONTHLY_RETENTION:-12}"
LOG_FILE="${BACKUP_LOG:-/var/log/nova-accounting-backup.log}"
# rclone: als leeg, alleen lokaal. Formaat: "myremote:bucket/prefix"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"
}

fail() {
  log "FAIL: $*"
  exit 1
}

mkdir -p "$HOST_BACKUP_DIR/daily" "$HOST_BACKUP_DIR/monthly"
touch "$LOG_FILE" || true

log "===== backup start ====="

# 1. Trigger de container-backup. /app/scripts/backup.js wordt in de
#    image mee gebundeld via Dockerfile.
RESULT_JSON=$(docker exec "$CONTAINER" node /app/scripts/backup.js 2>&1) || fail "container backup exited non-zero: $RESULT_JSON"

# Extract de path uit de JSON-line (laatste regel van stdout is
# {"ok":true,"path":"..."}). We greppen zodat pruned-lines geen storing geven.
BACKUP_PATH_IN_VOLUME=$(echo "$RESULT_JSON" | grep -oE '"path":"[^"]+"' | head -1 | sed 's/"path":"//; s/"$//')
if [ -z "$BACKUP_PATH_IN_VOLUME" ]; then
  fail "kon backup-pad niet uit container-output halen: $RESULT_JSON"
fi

BACKUP_FILENAME=$(basename "$BACKUP_PATH_IN_VOLUME")
log "container-backup klaar: $BACKUP_FILENAME"

# 2. Volume-pad op host — nova-accounting_accounting-data is de
#    docker-compose volume-naam. Als je die ooit hernoemt: pas hier aan.
VOLUME_ROOT=$(docker volume inspect nova-accounting_accounting-data --format '{{ .Mountpoint }}') || fail "volume niet gevonden"
BACKUP_ON_HOST="$VOLUME_ROOT/backups/$BACKUP_FILENAME"
[ -f "$BACKUP_ON_HOST" ] || fail "backup file niet zichtbaar op host: $BACKUP_ON_HOST"

# 3. Kopieer + comprimeer naar host-backup-dir
TODAY=$(date -u +%Y-%m-%d)
DAILY_DEST="$HOST_BACKUP_DIR/daily/accounting-$TODAY.db.gz"
gzip -c "$BACKUP_ON_HOST" > "$DAILY_DEST" || fail "gzip failed"
SIZE=$(stat -c '%s' "$DAILY_DEST" 2>/dev/null || stat -f '%z' "$DAILY_DEST")
log "gzip -> $DAILY_DEST ($SIZE bytes)"

# 4. Eerste van de maand → kopie naar monthly/
if [ "$(date -u +%d)" = "01" ]; then
  MONTHLY_DEST="$HOST_BACKUP_DIR/monthly/accounting-$(date -u +%Y-%m).db.gz"
  cp "$DAILY_DEST" "$MONTHLY_DEST"
  log "monthly copy -> $MONTHLY_DEST"
fi

# 5. Retentie lokaal
find "$HOST_BACKUP_DIR/daily" -name "accounting-*.db.gz" -mtime "+$DAILY_RETENTION_DAYS" -delete 2>/dev/null || true
# Maandelijkse: houd laatste N. Sorteer op mtime, skip N, verwijder rest.
ls -t "$HOST_BACKUP_DIR/monthly/"accounting-*.db.gz 2>/dev/null \
  | tail -n +$((MONTHLY_RETENTION_MONTHS + 1)) \
  | xargs -r rm -- || true

# 6. Remote sync (optioneel)
if [ -n "$RCLONE_REMOTE" ]; then
  if ! command -v rclone >/dev/null; then
    log "WARN: RCLONE_REMOTE gezet maar rclone niet geïnstalleerd — sla remote sync over"
  else
    log "rclone sync -> $RCLONE_REMOTE"
    rclone copy "$DAILY_DEST" "$RCLONE_REMOTE/daily/" --quiet || log "WARN: rclone daily copy faalde"
    if [ "$(date -u +%d)" = "01" ] && [ -n "${MONTHLY_DEST:-}" ]; then
      rclone copy "$MONTHLY_DEST" "$RCLONE_REMOTE/monthly/" --quiet || log "WARN: rclone monthly copy faalde"
    fi
    # Retentie op remote — dezelfde policy
    rclone delete "$RCLONE_REMOTE/daily/" --min-age "${DAILY_RETENTION_DAYS}d" --quiet || true
  fi
else
  log "INFO: geen RCLONE_REMOTE — alleen lokale backup (op één VPS = kwetsbaar; setup remote via deploy/BACKUP.md)"
fi

log "===== backup ok ====="
