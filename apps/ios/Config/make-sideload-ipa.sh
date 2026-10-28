#!/bin/sh
# Builds ADHX Share as an .ipa for SideStore or AltStore to sign and install.
# It's signed only locally ("ad hoc"), so it keeps the App Group entitlement:
# that tells the sideloading app to make the group the share card needs.
#
#   apps/ios/Config/make-sideload-ipa.sh [output.ipa]
#
# Run from anywhere on a Mac with Xcode. No Apple account needed.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
ios=$(dirname "$here")
out=${1:-"$PWD/adhx-share.ipa"}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

prefix=$(xcodebuild -project "$ios/ADHXShare.xcodeproj" -target "ADHX Share" -configuration Release \
  -showBuildSettings 2>/dev/null | awk -F' = ' '/ ADHX_BUNDLE_PREFIX = / { print $2; exit }')
[ -n "$prefix" ] || { echo "Couldn't read ADHX_BUNDLE_PREFIX" >&2; exit 1; }

xcodebuild -project "$ios/ADHXShare.xcodeproj" -scheme "ADHX Share" -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath "$work/build" \
  CODE_SIGNING_ALLOWED=NO -quiet build

app="$work/build/Build/Products/Release-iphoneos/ADHX Share.app"
for target in ShareExtension App; do
  sed "s/\$(ADHX_BUNDLE_PREFIX)/$prefix/" "$here/$target.entitlements" > "$work/$target.plist"
done
codesign -f -s - --entitlements "$work/ShareExtension.plist" "$app/PlugIns/ShareExtension.appex"
codesign -f -s - --entitlements "$work/App.plist" "$app"

mkdir "$work/Payload"
cp -R "$app" "$work/Payload/"
rm -f "$out"
(cd "$work" && zip -qry "$out" Payload)
echo "Made $out ($prefix)"
