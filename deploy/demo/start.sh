#!/bin/sh
# The public ADHX demo: the showcase world (credited posts, Sam and friends),
# read-only, reseeded every day so Right now and New stay fresh.
set -eu
cd "${ADHX_DIR:-/app}"

export DEMO_MODE=1 DEMO_USER=sam PARITY_SHOWCASE=1 PARITY_DEMO=1
# Wiped and rebuilt at every reseed: never point it at anything else.
export PARITY_OUT_DIR="${PARITY_OUT_DIR:-/tmp/adhx-demo-world}"
APP_PORT="${APP_PORT:-3000}"
export DATABASE_PATH="$PARITY_OUT_DIR/parity.db" MEDIA_DIR="$PARITY_OUT_DIR/media"
# Nothing to learn, download or sync; posts come with what they need.
export SEMANTIC_SEARCH=off KEEP_MEDIA=off KEEP_BACKFILL=off AUTO_SYNC_EVERY_MINUTES=0
export MOMENT_MIN_SAVERS=1 EMAIL_LINKS_TO_ADMIN=off TWITTER_CLIENT_ID= TWITTER_CLIENT_SECRET=
# Never fetch anything from the networks: an unknown post just isn't there.
export FXTWITTER_API_BASE=http://127.0.0.1:9 INSTAGRAM_OG_BASE=http://127.0.0.1:9 TNKTOK_API_BASE=http://127.0.0.1:9

tsx=./node_modules/.bin/tsx
# PID 1 in the container: take the gate, the app and the timer down with it.
trap 'kill 0; exit 0' INT TERM
PORT="${PORT:-8080}" APP_PORT="$APP_PORT" "$tsx" deploy/demo/gate.ts &

while true; do
  rm -rf "$PARITY_OUT_DIR" && mkdir -p "$PARITY_OUT_DIR"
  SESSION_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64'))")
  export SESSION_SECRET
  "$tsx" src/lib/db/migrate.ts
  "$tsx" e2e/parity/seed.ts
  PORT="$APP_PORT" HOSTNAME=127.0.0.1 node "${SERVER_JS:-server.js}" &
  app=$!
  (sleep 86400 && kill "$app") 2>/dev/null &
  timer=$!
  wait "$app" || true
  kill "$timer" 2>/dev/null || true
  echo '[demo] reseeding'
done
