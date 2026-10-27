#!/bin/bash
# The Mac proof with nobody at the keyboard, for the proof-mac workflow: the same checks as
# proof-mac.sh --names, with the clicks done by proof-drive.mjs. Run from app/, after npm ci:
#
#   bash scripts/proof-ci.sh <tag or "latest"> <run dir>
#
# Needs mitmdump on PATH and gh signed in (GH_TOKEN) for the attestation. ANTHROPIC_API_KEY, when set,
# goes to the app only; without it the Claude turn is skipped and the report says so. Exits non-zero
# when a download check fails; the report step decides the rest.
set -euo pipefail

TAG="${1:-latest}"
OUT="$2"
REPO="${GITHUB_REPOSITORY:-supertokenman/supertokenman}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/profile" "$OUT/claude"
cd "$OUT"
note() { printf '%s\n' "$*" | tee -a checks.log; }

# ---- 1. the download
case "$(uname -m)" in arm64) DMG="SuperTokenMan-arm64.dmg" ;; *) DMG="SuperTokenMan-x64.dmg" ;; esac
if [ "$TAG" = latest ]; then BASE="https://github.com/$REPO/releases/latest/download"; else BASE="https://github.com/$REPO/releases/download/$TAG"; fi
mkdir -p dl
for f in "$DMG" SHA256SUMS latest-mac.yml; do curl -fsSL -o "dl/$f" "$BASE/$f"; done
awk '/^version:/ {print $2}' dl/latest-mac.yml > version.txt
note "release: $TAG, version $(cat version.txt), $DMG"
(cd dl && shasum -a 256 -c SHA256SUMS --ignore-missing) 2>&1 | tee -a checks.log
gh attestation verify "dl/$DMG" --repo "$REPO" 2>&1 | tee -a checks.log
MNT="$(mktemp -d)"
hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "dl/$DMG" >/dev/null
cp -R "$MNT/SuperTokenMan.app" "$OUT/"
hdiutil detach "$MNT" >/dev/null
APP="$OUT/SuperTokenMan.app"
codesign --verify --deep --strict "$APP" 2>&1 | tee -a checks.log && note "codesign: valid"
spctl -a -vv "$APP" 2>&1 | tee -a checks.log
echo "$(sw_vers -productName) $(sw_vers -productVersion), $(uname -m)" > system.txt

# ---- 2. the decoy
DECOY="stm_decoy_$(openssl rand -hex 16)"
printf '%s\n' "$DECOY" > decoy.txt
unset DECOY

# ---- 3. the run, through mitmproxy without opening TLS
mitmdump --listen-port 8899 --ignore-hosts '.*' -w "$OUT/flows.mitm" > "$OUT/mitm.log" 2>&1 &
MITM_PID=$!
sleep 3
export STM_USER_DATA="$OUT/profile" CLAUDE_CONFIG_DIR="$OUT/claude"
export HTTPS_PROXY="http://127.0.0.1:8899" HTTP_PROXY="http://127.0.0.1:8899" NO_PROXY="127.0.0.1,localhost"
node "$HERE/proof-drive.mjs" --app "$APP" --out "$OUT" -- \
  --proxy-server=127.0.0.1:8899 --log-net-log="$OUT/netlog.json" > drive.log 2>&1 &
DRIVE=$!
for _ in $(seq 1 40); do [ -s app.pid ] && break; sleep 0.5; done
ROOT="$(cat app.pid 2>/dev/null || true)"

tree() { # the app and every process under it
  local all="$1" next="$1"
  while [ -n "$next" ]; do
    next="$(for p in $next; do pgrep -P "$p" || true; done | tr '\n' ' ')"
    all="$all $next"
  done
  echo "$all" | tr -s ' ' ','
}
: > connections.log
watch() {
  while kill -0 "$ROOT" 2>/dev/null; do
    pids="$(tree "$ROOT" | sed 's/^,//; s/,$//')"
    lsof -nP -a -p "$pids" -i 2>/dev/null | awk -v t="$(date +%H:%M:%S)" 'NR>1 && $NF!~/^\*:/ {print t, $1, $2, $8, $9, $10}' >> connections.log || true
    ps -o pid=,ppid=,comm= -p "$pids" 2>/dev/null >> processes.log || true
    sleep 0.5
  done
}
if [ -n "$ROOT" ]; then watch & WATCH=$!; else WATCH=""; note "the app did not start"; fi
wait "$DRIVE" || note "driver: ended with an error (see drive.json)"

# ---- 4. the stop
osascript -e 'tell application id "dev.arimayuji.supertokenman" to quit' >/dev/null 2>&1 || true
if [ -n "$ROOT" ]; then for _ in $(seq 1 20); do kill -0 "$ROOT" 2>/dev/null || break; sleep 0.5; done; fi
[ -n "$ROOT" ] && kill "$ROOT" 2>/dev/null || true
[ -n "$WATCH" ] && kill "$WATCH" 2>/dev/null || true
kill "$MITM_PID" 2>/dev/null || true
sleep 1
rm -rf "$APP" dl
