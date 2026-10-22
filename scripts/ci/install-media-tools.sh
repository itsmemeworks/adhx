#!/usr/bin/env bash
# CI-only Ubuntu installer. Cache signed package downloads, never installed files.
set -euo pipefail

if command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null &&
  ffmpeg -version >/dev/null 2>&1 && ffprobe -version >/dev/null 2>&1; then
  echo 'Using the runner media tools.'
  exit 0
fi

cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/adhx/apt/archives"
mkdir -p "$cache_dir/partial"

# Keep the host configuration intact. Azure's HTTP mirror has stalled for tens
# of minutes; use Ubuntu's signed repositories over HTTPS for this install only.
source_file="${ADHX_APT_SOURCES:-/etc/apt/sources.list.d/ubuntu.sources}"
source_dir="$(mktemp -d "${TMPDIR:-/tmp}/adhx-media.XXXXXX")"
trap 'rm -rf "$source_dir"' EXIT
chmod 755 "$source_dir"
if [[ "$source_file" == *.sources ]]; then
  sources="$source_dir/ubuntu.sources"
else
  sources="$source_dir/ubuntu.list"
fi
sed -E \
  -e 's|http(s)?://azure.archive.ubuntu.com/ubuntu/?|https://archive.ubuntu.com/ubuntu/|g' \
  -e 's|http://archive.ubuntu.com/ubuntu/?|https://archive.ubuntu.com/ubuntu/|g' \
  -e 's|http://security.ubuntu.com/ubuntu/?|https://security.ubuntu.com/ubuntu/|g' \
  "$source_file" > "$sources"
# apt's sandbox user must be able to read this temporary source list.
chmod 644 "$sources"

apt_options=(
  -o "Dir::Etc::sourcelist=$sources"
  -o 'Dir::Etc::sourceparts=-'
  -o "Dir::Cache::archives=$cache_dir"
  -o 'Binary::apt-get::APT::Keep-Downloaded-Packages=true'
  -o 'Acquire::Retries=2'
  -o 'Acquire::http::Timeout=20'
  -o 'Acquire::https::Timeout=20'
  -o 'DPkg::Lock::Timeout=30'
  -o 'APT::Update::Error-Mode=any'
)
sudo apt-get "${apt_options[@]}" update
sudo apt-get "${apt_options[@]}" install --no-install-recommends -y ffmpeg
ffmpeg -version
ffprobe -version
