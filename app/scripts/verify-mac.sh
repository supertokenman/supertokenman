#!/bin/bash
# Checks a signed, notarized build on a Mac: signature, Gatekeeper, the stapled ticket and the fuses.
set -euo pipefail
APP="${1:-release/mac-arm64/SuperTokenMan.app}"
codesign --verify --deep --strict --verbose=2 "$APP"
spctl -a -vv -t exec "$APP"
xcrun stapler validate "$APP"
npx @electron/fuses read --app "$APP"
echo "OK: $APP is signed, accepted by Gatekeeper and notarized."
