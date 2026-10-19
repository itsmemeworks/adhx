#!/bin/sh
set -eu

if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'This worker requires native Apple Silicon macOS.' >&2
  exit 1
fi
if [ "$#" -ne 1 ]; then
  echo 'Usage: deploy/mac/install.sh /absolute/path/to/private-worker.env' >&2
  exit 1
fi
case "$1" in /*) ;; *) echo 'Use an absolute environment-file path.' >&2; exit 1 ;; esac

ADHX_REPO=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
ADHX_NODE=$(command -v node)
ADHX_ENV=$1
ADHX_LAUNCH_DIR="$HOME/Library/LaunchAgents"
ADHX_LOG_DIR="$HOME/Library/Logs/ADHX-worker"
ADHX_PLIST="$ADHX_LAUNCH_DIR/me.adhx.worker.plist"

mkdir -p "$ADHX_LAUNCH_DIR" "$ADHX_LOG_DIR"
chmod 700 "$ADHX_LOG_DIR"
"$ADHX_NODE" --input-type=module - "$ADHX_REPO" "$ADHX_ENV" "$ADHX_PLIST" "$ADHX_LOG_DIR" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
const [repo, env, output, logs] = process.argv.slice(2)
if (process.platform !== 'darwin' || process.arch !== 'arm64' || Number(process.versions.node.split('.')[0]) < 22) throw new Error('Use native ARM64 Node.js 22 or newer')
const info = fs.statSync(env)
if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error('Environment file must belong to you with mode 600 or 400')
if (!fs.existsSync(path.join(repo, 'node_modules/tsx'))) throw new Error('Install repository dependencies before installing the worker')
const xml = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const args = [process.execPath, `--env-file=${env}`, '--import', 'tsx', path.join(repo, 'src/lib/processing/mac-runner.ts')]
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>me.adhx.worker</string>
<key>ProgramArguments</key><array>${args.map(a => `<string>${xml(a)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(repo)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>30</integer>
<key>Nice</key><integer>10</integer>
<key>ProcessType</key><string>Standard</string>
<key>StandardOutPath</key><string>${xml(path.join(logs, 'worker.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logs, 'worker-error.log'))}</string>
</dict></plist>
`
fs.writeFileSync(output, plist, { mode: 0o600 })
fs.chmodSync(output, 0o600)
NODE

plutil -lint "$ADHX_PLIST"
launchctl bootout "gui/$(id -u)" "$ADHX_PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$ADHX_PLIST"
echo "ADHX worker installed for this login. Logs: $ADHX_LOG_DIR"
