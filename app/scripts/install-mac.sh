#!/bin/bash
# Builds SuperTokenMan from this checkout and installs it in /Applications. Run it again to update:
# it pulls, rebuilds and replaces the app. The app is signed ad hoc (no Apple Developer account), so
# the quarantine flag is cleared here; without that, macOS refuses to open an app it cannot verify.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$(pwd)"
ARCH=$([ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64)

# the packager loads ES modules with require(), which Node does from 20.19 and 22.12 on
NODE_V="$(node -p 'process.versions.node' 2>/dev/null || echo 0)"
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)||a===23?0:1)' 2>/dev/null; then
  echo "!! Node $NODE_V is too old to package the app (it needs 20.19, 22.12 or newer)."
  echo "!! Update it, then run this again:  brew upgrade node   (or: nvm install 22)"
  exit 1
fi

echo "==> Updating the source"
# a failed pull must not quietly reinstall the old version
if ! git -C "$SRC/.." pull --ff-only; then
  echo ""
  echo "!! Could not update the source, so nothing was installed. What git sees here:"
  git -C "$SRC/.." status --short | head -20
  echo "!! Fix that (or run: git -C \"$SRC/..\" stash), then run this again."
  exit 1
fi
echo "   now at: $(git -C "$SRC/.." log -1 --format='%h %s')"
echo "==> Installing dependencies"
# ci installs exactly the lockfile and never rewrites it: a rewritten lockfile is a local change that
# would make the next update's pull refuse to run
npm ci --no-audit --no-fund
echo "==> Building for $ARCH"
npm run build
npx electron-builder --mac "--$ARCH" -c.extraMetadata.stmSource="$SRC"

APP="release/mac$([ "$ARCH" = arm64 ] && echo -arm64)/SuperTokenMan.app"
[ -d "$APP" ] || APP="$(ls -d release/mac*/SuperTokenMan.app | head -1)"
echo "==> Installing $APP"
# an open copy is asked to quit first, then replaced
osascript -e 'tell application "SuperTokenMan" to quit' >/dev/null 2>&1 || true
sleep 2
rm -rf /Applications/SuperTokenMan.app
cp -R "$APP" /Applications/
xattr -dr com.apple.quarantine /Applications/SuperTokenMan.app || true
echo "==> Done. Opening SuperTokenMan"
open /Applications/SuperTokenMan.app
