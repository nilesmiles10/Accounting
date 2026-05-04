#!/bin/bash
# Deploy script voor Nova Accounting. Pulls main, builds, deploys met
# health-check, automatic rollback bij failure.

set -euo pipefail

cd /opt/nova-accounting

HEALTH_URL="http://localhost:3334/api/health"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

PREVIOUS_HEAD="$(git rev-parse HEAD)"
echo "→ Previous HEAD: $PREVIOUS_HEAD"

echo "→ Pulling latest code..."
git pull

NEW_HEAD="$(git rev-parse HEAD)"
if [ "$PREVIOUS_HEAD" = "$NEW_HEAD" ]; then
  echo "  (no new commits — nothing to deploy)"
  exit 0
fi
echo "→ New HEAD: $NEW_HEAD"

echo "→ Building new image..."
docker compose build

echo "→ Recreating container..."
docker compose up -d

echo "→ Polling health for up to ${HEALTH_TIMEOUT}s..."
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    echo "✓ Update complete — Nova Accounting live (commit $NEW_HEAD)"
    exit 0
  fi
  sleep 2
done

echo "⚠ Health check FAILED — rolling back..."
docker compose logs --tail=50 || true

git checkout "$PREVIOUS_HEAD"
docker compose build
docker compose up -d

sleep 5
if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
  echo "✓ Rollback succeeded — back on $PREVIOUS_HEAD"
  exit 1
else
  echo "✗ Rollback ALSO failed — manual intervention required"
  exit 2
fi
