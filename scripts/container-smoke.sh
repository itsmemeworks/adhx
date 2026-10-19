#!/usr/bin/env bash
# Local/CI check of an already-built image. Never publishes or deploys it.
set -euo pipefail

image=${IMAGE_TAG:?Set IMAGE_TAG to the image built from this revision}
container="adhx-smoke-${GITHUB_RUN_ID:-local}-$$"
volume="${container}-data"
models=${1:-}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker logs "$container" 2>/dev/null || true
  fi
  docker rm --force "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

docker volume create "$volume" >/dev/null
runtime=(--mount "type=volume,source=$volume,target=/data"
  --env SESSION_SECRET=ci-synthetic-session-secret-at-least-32-characters
  --env NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
  --env SEMANTIC_SEARCH=off --env KEEP_MEDIA=off
  --env SEMANTIC_THREADS=1 --env EMAIL_LINKS_TO_ADMIN=1)

docker run --rm "${runtime[@]}" --entrypoint sh "$image" -euc '
  ./node_modules/.bin/tsx src/lib/db/migrate.ts
  ./node_modules/.bin/tsx scripts/container-runtime-check.mjs seed
'

start() {
  docker run --detach --name "$container" "${runtime[@]}" "$image" >/dev/null
  for attempt in $(seq 1 60); do
    if docker exec "$container" node -e '
      fetch("http://127.0.0.1:3000/api/health", {signal: AbortSignal.timeout(2000)})
        .then(async r => { if (!r.ok || (await r.json()).status !== "healthy") process.exit(1) })
        .catch(() => process.exit(1))
    ' 2>/dev/null; then
      return
    fi
    sleep 2
  done
  echo 'Container did not become healthy within 120 seconds' >&2
  return 1
}

start
docker exec "$container" ./node_modules/.bin/tsx scripts/container-runtime-check.mjs http
# Recreate from the image, retaining only the documented persistent volume.
docker rm --force "$container" >/dev/null
start
docker exec "$container" ./node_modules/.bin/tsx scripts/container-runtime-check.mjs http
if [ "$models" = '--models' ]; then
  docker exec "$container" ./node_modules/.bin/tsx scripts/container-runtime-check.mjs models
fi
