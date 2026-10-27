#!/bin/bash
# The Mac performance run for the perf-mac workflow. Run from app/, after npm ci:
#
#   bash scripts/perf-ci.sh <tag or "latest"> <run dir>
#
# Downloads the released dmg, checks it against SHA256SUMS, copies the app out, fetches the previous
# release's perf-mac-<version>.json when it has one, and runs perf-mac.mjs. Needs gh signed in (GH_TOKEN).
set -euo pipefail

TAG="${1:-latest}"
OUT="$2"
REPO="${GITHUB_REPOSITORY:-supertokenman/supertokenman}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/dl"
cd "$OUT"

case "$(uname -m)" in arm64) DMG="SuperTokenMan-arm64.dmg" ;; *) DMG="SuperTokenMan-x64.dmg" ;; esac
[ "$TAG" = latest ] && TAG="$(gh release view --repo "$REPO" --json tagName -q .tagName)"
gh release download "$TAG" --repo "$REPO" --dir dl -p "$DMG" -p SHA256SUMS -p latest-mac.yml
(cd dl && shasum -a 256 -c SHA256SUMS --ignore-missing)
VERSION="$(awk '/^version:/ {print $2}' dl/latest-mac.yml)"
echo "$VERSION" > version.txt

# the release published before this one, and its numbers when they were attached
PREV="$(gh release list --repo "$REPO" --exclude-drafts --exclude-pre-releases --limit 50 --json tagName,publishedAt \
  -q "sort_by(.publishedAt) | reverse | map(.tagName) | (index(\"$TAG\") // -1) as \$i | if \$i >= 0 then .[\$i + 1] else empty end" || true)"
if [ -n "$PREV" ] && [ "$PREV" != null ]; then
  mkdir -p prev
  if gh release download "$PREV" --repo "$REPO" --dir prev -p 'perf-mac-*.json' 2>/dev/null; then
    cp prev/perf-mac-*.json prev-perf.json
    echo "comparing with $PREV"
  else
    echo "no perf json on $PREV"
  fi
fi

MNT="$(mktemp -d)"
hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "dl/$DMG" >/dev/null
cp -R "$MNT/SuperTokenMan.app" "$OUT/"
hdiutil detach "$MNT" >/dev/null

node "$HERE/perf-mac.mjs" --app "$OUT/SuperTokenMan.app" --out "$OUT" --dmg "dl/$DMG" --version "$VERSION"
rm -rf "$OUT/SuperTokenMan.app" "$OUT"/run-* dl
