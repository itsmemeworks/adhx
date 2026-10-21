#!/bin/sh
set -eu
ADHX_PLIST="$HOME/Library/LaunchAgents/me.adhx.worker.plist"
launchctl bootout "gui/$(id -u)" "$ADHX_PLIST" 2>/dev/null || true
rm -f "$ADHX_PLIST"
echo 'ADHX worker stopped and uninstalled. Your private configuration, model cache and logs remain.'
