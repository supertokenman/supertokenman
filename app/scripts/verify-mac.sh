#!/bin/bash
# Checks a signed, notarized build on a Mac: signature, Gatekeeper, the stapled ticket and the fuses, and
# that its panels can get Claude Code: the pinned download for its own cpu (or, in a STM_BUNDLE_CLI=1
# build, the bundled binary).
set -euo pipefail
APP="${1:-release/mac-arm64/SuperTokenMan.app}"
codesign --verify --deep --strict --verbose=2 "$APP"
spctl -a -vv -t exec "$APP"
xcrun stapler validate "$APP"
# lipo says x86_64, npm names the package x64
arch=$(lipo -archs "$APP/Contents/MacOS/SuperTokenMan")
[ "$arch" = x86_64 ] && arch=x64
res="$APP/Contents/Resources"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
npx @electron/asar extract-file "$res/app.asar" dist-electron/cli-manifest.json
mv cli-manifest.json "$work/manifest.json"
# both Mac cpus need a pin (0.1.21 shipped an Intel build whose panels had no Claude Code), each from
# the npm registry with a sha512
node -e '
const m = require(process.argv[1])
for (const k of ["darwin-arm64", "darwin-x64"]) {
  const e = m.platforms[k]
  if (!e) throw new Error("no pinned Claude Code for " + k)
  if (!e.url.startsWith("https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-" + k + "/")) throw new Error("bad url for " + k)
  if (!/^sha512-/.test(e.integrity)) throw new Error("no sha512 for " + k)
}' "$work/manifest.json"
bundled=$(find "$res/app.asar.unpacked/node_modules/@anthropic-ai" -path "*claude-agent-sdk-darwin-$arch/*" -type f -perm -u+x 2>/dev/null | head -1 || true)
if [ -n "$bundled" ]; then
  echo "Claude Code is bundled (STM_BUNDLE_CLI=1 build): $bundled"
  bin="$bundled"
else
  # what the app does on first launch: fetch the pinned tarball, check its sha512, take package/claude
  url=$(node -p 'require(process.argv[1]).platforms["darwin-'"$arch"'"].url' "$work/manifest.json")
  want=$(node -p 'require(process.argv[1]).platforms["darwin-'"$arch"'"].integrity' "$work/manifest.json")
  curl -fsSL -o "$work/cli.tgz" "$url"
  got="sha512-$(openssl dgst -sha512 -binary "$work/cli.tgz" | base64 | tr -d '\n')"
  [ "$got" = "$want" ] || { echo "The pinned Claude Code tarball for $arch does not match its integrity" >&2; exit 1; }
  tar -xzf "$work/cli.tgz" -C "$work" package/claude
  bin="$work/package/claude"
fi
# the binary runs from outside the bundle, so it must carry its own valid signature
codesign --verify --strict --verbose=2 "$bin"
lipo -archs "$bin" | grep -qw "$([ "$arch" = x64 ] && echo x86_64 || echo arm64)"
cli=$(node -p 'require(process.argv[1]).cli' "$work/manifest.json")
"$bin" --version | grep -q "^$cli " || { echo "Claude Code is not $cli" >&2; exit 1; }
npx @electron/fuses read --app "$APP"
echo "OK: $APP is signed, accepted by Gatekeeper and notarized; Claude Code $cli for $arch resolves."
