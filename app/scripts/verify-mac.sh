#!/bin/bash
# Checks a signed, notarized build on a Mac: signature, Gatekeeper, the stapled ticket and the fuses.
set -euo pipefail
APP="${1:-release/mac-arm64/SuperTokenMan.app}"
codesign --verify --deep --strict --verbose=2 "$APP"
spctl -a -vv -t exec "$APP"
xcrun stapler validate "$APP"
# each build carries the Claude binary for its own cpu, or no panel can start
arch=$(lipo -archs "$APP/Contents/MacOS/SuperTokenMan")
# lipo says x86_64, npm names the package x64
[ "$arch" = x86_64 ] && arch=x64
bin=$(find "$APP/Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai" -path "*claude-agent-sdk-darwin-$arch/*" -type f -perm -u+x | head -1)
[ -n "$bin" ] || { echo "No Claude binary for $arch in $APP; found:" >&2; ls "$APP/Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai" >&2 || true; exit 1; }
npx @electron/fuses read --app "$APP"
echo "OK: $APP is signed, accepted by Gatekeeper and notarized."
