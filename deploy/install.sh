#!/bin/sh
# ADHX on any Linux server, in one command:
#
#   curl -fsSL https://raw.githubusercontent.com/itsmemeworks/adhx/main/deploy/install.sh | sudo sh
#
# With a domain whose DNS points at the server, HTTPS comes with it:
#
#   curl -fsSL https://raw.githubusercontent.com/itsmemeworks/adhx/main/deploy/install.sh | sudo ADHX_DOMAIN=adhx.example.com sh
#
# It installs Docker if it's missing, puts ADHX in /opt/adhx, starts it and
# prints the link that makes you the owner. Run it again to update; your
# settings in /opt/adhx/.env and everything in the data volume stay.
#
# Settings (environment, or /opt/adhx/.env from an earlier run or cloud-init):
#   ADHX_DOMAIN  your domain, for HTTPS on ports 80 and 443 (Caddy gets the
#                certificate). Empty: plain HTTP on port 3000.
#   SETUP_CODE   the code you type once to become the owner. Empty: one is
#                made for you and saved in /opt/adhx/setup.txt.
#   ADHX_DIR     where the Compose project lives (default /opt/adhx).
set -eu

ADHX_DIR="${ADHX_DIR:-/opt/adhx}"
SOURCE="${ADHX_SOURCE:-https://raw.githubusercontent.com/itsmemeworks/adhx/main/deploy}"

say() { printf 'adhx: %s\n' "$*"; }
fail() {
  printf 'adhx: %s\n' "$*" >&2
  exit 1
}

[ "$(id -u)" = 0 ] || fail 'Run it as root, for example: curl -fsSL <this script> | sudo sh'
command -v curl >/dev/null 2>&1 || fail 'curl is missing. Install it and run this again.'

mkdir -p "$ADHX_DIR"
cd "$ADHX_DIR"

# A value from the environment wins; otherwise keep the one saved last time.
saved() {
  if [ -f .env ]; then sed -n "s/^$1=//p" .env | tail -n 1; fi
}
ADHX_DOMAIN="${ADHX_DOMAIN:-$(saved ADHX_DOMAIN)}"
SETUP_CODE="${SETUP_CODE:-$(saved SETUP_CODE)}"
if [ -z "$SETUP_CODE" ]; then
  # Same alphabet as the server's own codes: no 0/O, 1/I/L or U.
  raw=$(LC_ALL=C tr -dc 'ABCDEFGHJKMNPQRSTVWXYZ23456789' </dev/urandom | head -c 12)
  SETUP_CODE="$(printf %s "$raw" | cut -c1-4)-$(printf %s "$raw" | cut -c5-8)-$(printf %s "$raw" | cut -c9-12)"
fi

if ! command -v docker >/dev/null 2>&1; then
  say 'Installing Docker (get.docker.com)...'
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 ||
  fail 'Docker Compose is missing. Install the docker-compose-plugin package and run this again.'

# With a domain: ADHX behind Caddy with HTTPS. Without: ADHX alone on 3000.
# Both keep the data in the same volume, so adding a domain later keeps it all.
if [ -n "$ADHX_DOMAIN" ]; then recipe=vps; else recipe=one-click; fi
curl -fsSL "$SOURCE/$recipe/docker-compose.yml" -o docker-compose.yml.new
mv docker-compose.yml.new docker-compose.yml

umask 077
printf 'ADHX_DOMAIN=%s\nSETUP_CODE=%s\n' "$ADHX_DOMAIN" "$SETUP_CODE" >.env

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  if [ -n "$ADHX_DOMAIN" ]; then ufw allow 80,443/tcp >/dev/null; else ufw allow 3000/tcp >/dev/null; fi
fi

say 'Starting ADHX...'
[ "${ADHX_SKIP_PULL:-}" = 1 ] || docker compose pull --quiet
docker compose up -d --remove-orphans

health="fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
tries=0
until docker compose exec -T adhx node -e "$health" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] || fail "ADHX didn't start. See: cd $ADHX_DIR && docker compose logs adhx"
  sleep 5
done

if [ -n "$ADHX_DOMAIN" ]; then
  address="https://$ADHX_DOMAIN"
else
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  address="http://${ip:-<this server>}:3000"
fi
case "$SETUP_CODE" in
  *[!A-Za-z0-9-]*) link="$address/setup" ;;
  *) link="$address/setup?code=$SETUP_CODE" ;;
esac

echo
# Setup answers 200 only until someone has made ADHX theirs.
open_setup="fetch('http://127.0.0.1:3000/setup',{redirect:'manual'}).then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))"
if docker compose exec -T adhx node -e "$open_setup" >/dev/null 2>&1; then
  printf 'Open this link to make ADHX yours:\n  %s\nSetup code: %s\n' "$link" "$SETUP_CODE" >setup.txt
  say 'ADHX is running.'
  cat setup.txt
else
  rm -f setup.txt
  say "ADHX is up to date at $address"
fi
if [ -z "$ADHX_DOMAIN" ]; then
  echo
  say 'For HTTPS, point a domain at this server and run this again with ADHX_DOMAIN=your.domain.'
fi
