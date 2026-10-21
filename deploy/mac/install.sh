#!/bin/sh
set -eu

if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'This worker requires native Apple Silicon macOS.' >&2
  exit 1
fi
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ] || { [ "$#" -eq 2 ] && [ "$2" != --check ]; }; then
  echo 'Usage: deploy/mac/install.sh /absolute/path/to/private-worker.env [--check]' >&2
  exit 1
fi
case "$1" in /*) ;; *) echo 'Use an absolute environment-file path.' >&2; exit 1 ;; esac

ADHX_REPO=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
ADHX_NODE=$(command -v node)
ADHX_ENV=$1
ADHX_LAUNCH_DIR="$HOME/Library/LaunchAgents"
ADHX_LOG_DIR="$HOME/Library/Logs/ADHX-worker"
ADHX_PLIST="$ADHX_LAUNCH_DIR/me.adhx.worker.plist"

"$ADHX_NODE" --input-type=module - "$ADHX_REPO" "$ADHX_ENV" "$ADHX_PLIST" "$ADHX_LOG_DIR" "${2:-}" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const [repo, env, output, logs, mode] = process.argv.slice(2)
if (process.platform !== 'darwin' || process.arch !== 'arm64' || Number(process.versions.node.split('.')[0]) < 22) throw new Error('Use native ARM64 Node.js 22 or newer')
const info = fs.statSync(env)
if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error('Environment file must belong to you with mode 600 or 400')
if (!fs.existsSync(path.join(repo, 'node_modules/tsx'))) throw new Error('Install repository dependencies before installing the worker')
process.loadEnvFile(env)
const ffmpeg = process.env.FFMPEG_PATH || execFileSync('/usr/bin/which', ['ffmpeg'], { encoding: 'utf8' }).trim()
if (!path.isAbsolute(ffmpeg)) throw new Error('FFMPEG_PATH must be absolute for launchd')
const version = execFileSync(ffmpeg, ['-version'], { encoding: 'utf8', timeout: 10000 }).split('\n')[0]
if (!version.startsWith('ffmpeg version ')) throw new Error('The selected binary is not FFmpeg')
if (mode === '--check') { console.log(`Worker prerequisites passed: ${version}`); process.exit(0) }
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.mkdirSync(logs, { recursive: true, mode: 0o700 })
fs.chmodSync(logs, 0o700)
const xml = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const args = [process.execPath, `--env-file=${env}`, '--import', 'tsx', path.join(repo, 'src/lib/processing/mac-runner.ts')]
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>me.adhx.worker</string>
<key>ProgramArguments</key><array>${args.map(a => `<string>${xml(a)}</string>`).join('')}</array>
<key>EnvironmentVariables</key><dict>
<key>FFMPEG_PATH</key><string>${xml(ffmpeg)}</string>
<key>PATH</key><string>${xml(`${path.dirname(process.execPath)}:${path.dirname(ffmpeg)}:/usr/bin:/bin`)}</string>
</dict>
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

if [ "${2:-}" = --check ]; then exit 0; fi

plutil -lint "$ADHX_PLIST"
launchctl bootout "gui/$(id -u)" "$ADHX_PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$ADHX_PLIST"
echo "ADHX worker installed for this login. Logs: $ADHX_LOG_DIR"
