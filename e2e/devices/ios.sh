#!/usr/bin/env bash
# Build ADHX Share and the DeviceDriver UI test, install both on a real iPhone
# and keep the driver running; it takes commands from e2e/devices/hub.mjs.
#
#   IOS_UDID=<udid> e2e/devices/ios.sh
#
# Needs apps/ios/Config/Local.xcconfig with your team (see apps/ios/README.md),
# the phone unlocked, trusted and in Developer Mode, and hub.mjs running.
# DEVICE_HUB_HOST is how the phone reaches this Mac: by default the address of
# the USB tunnel Xcode keeps to a wired iPhone, else this Mac's Wi-Fi address.
# If the driver stops (a crash, an app kill), it starts again; `drive.mjs ios
# quit` ends it for good.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${IOS_UDID:?Set IOS_UDID (xcrun devicectl list devices)}"
if [[ -z "${DEVICE_HUB_HOST:-}" ]]; then
  info="$(mktemp)"
  xcrun devicectl device info details --device "$IOS_UDID" --json-output "$info" >/dev/null 2>&1 || true
  tunnel="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['result']['connectionProperties'].get('tunnelIPAddress') or '')" "$info" 2>/dev/null || true)"
  rm -f "$info"
  if [[ -n "$tunnel" ]]; then
    # The Mac's end of the tunnel is the phone's address with ::2 for ::1.
    DEVICE_HUB_HOST="[${tunnel%::1}::2]"
  else
    DEVICE_HUB_HOST="$(ipconfig getifaddr en0 || ipconfig getifaddr en1)"
  fi
fi
export TEST_RUNNER_ADHX_DRIVER_URL="http://${DEVICE_HUB_HOST}:${DEVICE_HUB_PORT:-3700}/"
DERIVED="${DERIVED_DATA:-${TMPDIR:-/tmp}/adhx-device-driver}"
common=(-project apps/ios/ADHXShare.xcodeproj -scheme "ADHX Device Driver"
  -destination "id=${IOS_UDID}" -derivedDataPath "$DERIVED" -allowProvisioningUpdates)
echo "[ios] driver → ${TEST_RUNNER_ADHX_DRIVER_URL}"
xcodebuild build-for-testing "${common[@]}"
until xcodebuild test-without-building "${common[@]}" -only-testing:DeviceDriver/DeviceDriverTests/testDrive; do
  echo "[ios] the driver stopped; starting it again"
  sleep 2
done
