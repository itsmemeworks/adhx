#!/bin/sh
# Writes which release this build is into the app, for Settings
# (build-info.txt in its resources): "2.2.0" on the vX.Y.Z tag itself, else
# "2.2.0 +3 · abc1234" (three commits after it), with " · edited" when the
# working tree had changes. Without tags (a shallow clone) it's the commit.
set -u
out="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/build-info.txt"
git="/usr/bin/git -C ${SRCROOT}"
described=$($git describe --tags --match 'v[0-9]*' --long --dirty 2>/dev/null) || described=""
if [ -n "$described" ]; then
  edited=""
  case "$described" in *-dirty) edited=" · edited"; described=${described%-dirty} ;; esac
  sha=${described##*-g}
  rest=${described%-g*}
  ahead=${rest##*-}
  version=${rest%-*}
  version=${version#v}
  if [ "$ahead" = "0" ] && [ -z "$edited" ]; then build="$version"; else build="$version +$ahead · $sha$edited"; fi
else
  build=$($git rev-parse --short HEAD 2>/dev/null) || build=""
fi
mkdir -p "$(dirname "$out")"
printf '%s' "$build" > "$out"
