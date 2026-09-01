#!/bin/bash
# Publishes a new self-update payload: builds the web app, zips dist/ into
# update/webapp.zip, and bumps update/version.txt. Commit + push the result
# and every installed Flor.app will pick it up automatically next launch
# (see native/update.go) — no reinstall needed.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Building web app"
npm run build

UPDATE_DIR="update"
mkdir -p "$UPDATE_DIR"

CURRENT=0
if [ -f "$UPDATE_DIR/version.txt" ]; then
  CURRENT=$(cat "$UPDATE_DIR/version.txt")
fi
NEXT=$((CURRENT + 1))

echo "==> Zipping dist/ -> $UPDATE_DIR/webapp.zip (version $NEXT)"
rm -f "$UPDATE_DIR/webapp.zip"
(cd dist && zip -r -X -q "../$UPDATE_DIR/webapp.zip" .)

printf '%s' "$NEXT" > "$UPDATE_DIR/version.txt"

echo "==> Done: $UPDATE_DIR/version.txt=$NEXT"
du -sh "$UPDATE_DIR/webapp.zip"
echo "==> Commit and push $UPDATE_DIR/ to publish this update."
