#!/bin/bash
# The Mac proof: what the released app, and every process it starts, connects to while a person uses it,
# and whether a decoy secret put in the vault ever shows up outside it. Run on a Mac, no install needed:
#
#   bash app/scripts/proof-mac.sh                 # 10 minutes, connections of the whole process tree
#   bash app/scripts/proof-mac.sh --minutes 5
#   bash app/scripts/proof-mac.sh --mitm          # also read the traffic through mitmproxy
#                                                 # (brew install mitmproxy), to search it for the decoy
#
# It downloads the latest release, checks it (SHA256SUMS, the GitHub build attestation when gh is there,
# the signature and the notarization), runs it from a work folder with its own profile, and writes
# REPORT.md and the raw logs to ~/stm-proof-<date>. Your own install and profile are not touched; Claude
# Code uses your usual login.
set -euo pipefail

MINUTES=10
MITM=0
while [ $# -gt 0 ]; do
  case "$1" in
    --minutes) MINUTES="$2"; shift 2 ;;
    --mitm) MITM=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

REPO="supertokenman/supertokenman"
OUT="$HOME/stm-proof-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT/profile"
cd "$OUT"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '%s\n' "$*" | tee -a checks.log; }

# ---- 1. the download
case "$(uname -m)" in arm64) DMG="SuperTokenMan-arm64.dmg" ;; *) DMG="SuperTokenMan-x64.dmg" ;; esac
say "1/5 Downloading $DMG from the latest release"
curl -fsSLO "https://github.com/$REPO/releases/latest/download/$DMG"
curl -fsSLO "https://github.com/$REPO/releases/latest/download/SHA256SUMS"
curl -fsSLO "https://github.com/$REPO/releases/latest/download/latest-mac.yml"
VERSION="$(awk '/^version:/ {print $2}' latest-mac.yml)"

say "2/5 Checking it"
shasum -a 256 -c SHA256SUMS --ignore-missing 2>&1 | tee -a checks.log
if command -v gh >/dev/null; then
  gh attestation verify "$DMG" --repo "$REPO" 2>&1 | tee -a checks.log || { echo "attestation did not verify" >&2; exit 1; }
else
  note "gh not installed: build attestation not checked (brew install gh)"
fi
MNT="$(mktemp -d)"
hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "$DMG" >/dev/null
cp -R "$MNT/SuperTokenMan.app" "$OUT/"
hdiutil detach "$MNT" >/dev/null
APP="$OUT/SuperTokenMan.app"
codesign --verify --deep --strict "$APP" 2>&1 | tee -a checks.log && note "codesign: valid"
spctl -a -vv "$APP" 2>&1 | tee -a checks.log

# ---- 2. the decoy
DECOY="stm_decoy_$(openssl rand -hex 16)"
printf '%s\n' "$DECOY" > decoy.txt

say "3/5 What to do in the app"
cat <<EOF
The app opens from $OUT with its own profile. While it runs for up to $MINUTES minutes:

  1. Cmd+K, "Connections", then the Vault tab: add a secret named DECOY_KEY with this value
     (it is already in decoy.txt):
       $DECOY
     Tick "Commands can read it", then Save.
  2. Open a panel and ask Claude: "run echo hello and tell me the date".
     Approve the command.
  3. Use the app as you would: Memory, Tasks, a second panel. Do not paste the decoy anywhere else.

Press Enter here when you are done, or wait for the timer.
EOF

# ---- 3. the run
MITM_PID=""
EXTRA=()
if [ "$MITM" = 1 ]; then
  command -v mitmdump >/dev/null || { echo "--mitm needs mitmproxy: brew install mitmproxy" >&2; exit 1; }
  mitmdump -q --listen-port 8899 -w "$OUT/flows.mitm" &
  MITM_PID=$!
  sleep 2
  CA="$HOME/.mitmproxy/mitmproxy-ca-cert.pem"
  export HTTPS_PROXY="http://127.0.0.1:8899" HTTP_PROXY="http://127.0.0.1:8899" NODE_EXTRA_CA_CERTS="$CA"
  EXTRA=(--proxy-server=127.0.0.1:8899 --ignore-certificate-errors)
  note "mitm: traffic goes through mitmproxy on 127.0.0.1:8899; the window trusts its certificate for this run only"
fi
STM_USER_DATA="$OUT/profile" "$APP/Contents/MacOS/SuperTokenMan" "${EXTRA[@]}" >app.log 2>&1 &
ROOT=$!
note "app started: pid $ROOT, version $VERSION"

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
watch &
WATCH=$!
read -r -t $((MINUTES * 60)) _ || true

# ---- 4. the stop
say "4/5 Closing the app"
osascript -e 'tell application id "dev.arimayuji.supertokenman" to quit' >/dev/null 2>&1 || kill "$ROOT" 2>/dev/null || true
for _ in $(seq 1 20); do kill -0 "$ROOT" 2>/dev/null || break; sleep 0.5; done
kill "$ROOT" 2>/dev/null || true
kill "$WATCH" 2>/dev/null || true
[ -n "$MITM_PID" ] && kill "$MITM_PID" 2>/dev/null || true
sleep 1

# ---- 5. the report
say "5/5 Writing the report"
# remote endpoints, without loopback, each with the processes that opened it
awk '{split($5, a, "->"); if (a[2] == "") next; print a[2], $2}' connections.log \
  | grep -vE '^(127\.|\[::1\]|localhost)' | sort -u > endpoints.txt || true
hosts_md="$(
  cut -d' ' -f1 endpoints.txt | sort -u | while read -r ep; do
    ip="${ep%:*}"; ip="${ip#[}"; ip="${ip%]}"; port="${ep##*:}"
    procs="$(awk -v e="$ep" '$1==e {print $2}' endpoints.txt | sort -u | tr '\n' ' ')"
    name="$(host "$ip" 2>/dev/null | awk '/pointer/ {print $NF}' | head -1)"
    org="$(whois "$ip" 2>/dev/null | awk -F': *' 'tolower($1) ~ /^(orgname|org-name|descr|netname)$/ {print $2; exit}')"
    printf '| %s | %s | %s | %s | %s |\n' "$ip" "$port" "${name:--}" "${org:--}" "$procs"
  done
)"
on_disk="$(grep -rlF "$DECOY" "$OUT/profile" "$HOME/.claude" 2>/dev/null | grep -v "$OUT/decoy.txt" || true)"
in_mitm="not checked (run with --mitm)"
if [ -f flows.mitm ]; then
  if grep -qF "$DECOY" flows.mitm; then in_mitm="FOUND in the recorded traffic"; else in_mitm="not found in the recorded traffic"; fi
  mitmdump -nr flows.mitm --flow-detail 0 2>/dev/null | awk '{print $2, $3}' | sort | uniq -c | sort -rn > mitm-requests.txt || true
fi

cat > REPORT.md <<EOF
# Mac proof: SuperTokenMan $VERSION

Run on $(sw_vers -productName) $(sw_vers -productVersion), $(uname -m), $(date -u +"%Y-%m-%d %H:%M UTC"), for up to $MINUTES minutes
of use. Made with \`app/scripts/proof-mac.sh\`$( [ "$MITM" = 1 ] && echo ' --mitm').

## The download

\`\`\`
$(cat checks.log)
\`\`\`

## Where the app and its processes connected

Every TCP and UDP connection of the app and of every process it started (Claude Code, git, docker and
the rest), sampled twice a second with \`lsof\`. Loopback is left out. The name is the reverse DNS; the
owner is the first organisation line in \`whois\`.

| Address | Port | Name | Owner | Processes |
|---|---|---|---|---|
$hosts_md

Raw: \`connections.log\`, \`processes.log\`, \`endpoints.txt\`.

## The decoy secret

A value made for this run (\`decoy.txt\`) was put in the vault as DECOY_KEY.

- On disk, outside \`decoy.txt\`, in this run's profile and in \`~/.claude\`: $( [ -z "$on_disk" ] && echo "not found" || printf 'FOUND in:\n%s' "$on_disk")
- In the network traffic: $in_mitm

## What this does not show

- A sample twice a second can miss a connection that opens and closes in between.
- Without \`--mitm\`, the destinations are known but not what was sent to them.
- With \`--mitm\`, traffic that refuses the proxy or its certificate is listed by destination only.
- Claude Code sends your messages to Anthropic; that is its job and it is listed on the Security page.
EOF

say "Done: $OUT/REPORT.md"
echo "Delete DECOY_KEY from the vault if you open this profile again; the work folder can be deleted."
