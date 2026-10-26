#!/usr/bin/env bash
# One-time signing setup on your Mac. It checks the Developer ID certificate, puts the five signing
# secrets into the release environment of supertokenman/supertokenman with gh (read from files and prompts, never echoed, never
# written to the repo), and can run a signed build and verify it.
#
# Before running it:
#   1. Xcode > Settings > Accounts > Manage Certificates > + > Developer ID Application.
#   2. App Store Connect > Users and Access > Integrations > App Store Connect API > + (role Developer).
#      Download the .p8 (only possible once) and note the Key ID and the Issuer ID.
#   3. gh auth login (an account that can edit supertokenman/supertokenman).
#
# Usage: cd app && bash scripts/apple-setup.sh
set -euo pipefail

REPO="supertokenman/supertokenman"
say() { printf '\n==> %s\n' "$*"; }
fail() { printf 'Stopped: %s\n' "$*" >&2; exit 1; }

[[ "$(uname)" == "Darwin" ]] || fail "this runs on a Mac."
command -v gh >/dev/null || fail "gh is not installed (brew install gh)."
gh auth status >/dev/null 2>&1 || fail "gh is not signed in (gh auth login)."
command -v xcrun >/dev/null || fail "Xcode command line tools are missing (xcode-select --install)."

say "Developer ID certificate"
ids="$(security find-identity -v -p codesigning | grep 'Developer ID Application' || true)"
[[ -n "$ids" ]] || fail "no Developer ID Application certificate in the keychain. Create it in Xcode (step 1 above)."
echo "Found $(printf '%s\n' "$ids" | wc -l | tr -d ' ') Developer ID Application identity."

say "Export the certificate as .p12"
cat <<'EOF'
Keychain Access opens now. In "login" > "My Certificates", right-click
"Developer ID Application: ..." > Export, save it as .p12 outside this repository
(for example ~/keys/DeveloperID.p12) and choose a password.
Export only that one certificate, so no other key ends up in the secret.
EOF
open -a "Keychain Access" || true
read -r -p "Path to the .p12: " P12
P12="${P12/#\~/$HOME}"
[[ -f "$P12" ]] || fail "no file at $P12."
case "$(cd "$(dirname "$P12")" && pwd)" in "$(git rev-parse --show-toplevel 2>/dev/null || echo /nonexistent)"*) fail "the .p12 is inside the repository; move it out." ;; esac
read -r -s -p "The .p12 password (not shown): " P12_PASS; echo
openssl pkcs12 -in "$P12" -passin "pass:$P12_PASS" -nokeys -legacy >/dev/null 2>&1 \
  || openssl pkcs12 -in "$P12" -passin "pass:$P12_PASS" -nokeys >/dev/null 2>&1 \
  || fail "the .p12 did not open with that password."

say "App Store Connect API key"
read -r -p "Path to the AuthKey_XXXX.p8: " P8
P8="${P8/#\~/$HOME}"
[[ -f "$P8" ]] || fail "no file at $P8."
grep -q "BEGIN PRIVATE KEY" "$P8" || fail "$P8 does not look like a .p8 key."
read -r -p "Key ID: " KEY_ID
read -r -p "Issuer ID: " ISSUER
[[ "$KEY_ID" =~ ^[A-Z0-9]{10}$ ]] || fail "the Key ID is 10 letters and digits."
[[ "$ISSUER" =~ ^[0-9a-f-]{36}$ ]] || fail "the Issuer ID looks like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx."

say "Secrets in $REPO"
base64 -i "$P12" | gh secret set MAC_CERT_P12_BASE64 --env release --repo "$REPO"
printf '%s' "$P12_PASS" | gh secret set MAC_CERT_PASSWORD --env release --repo "$REPO"
gh secret set APPLE_API_KEY_P8 --env release --repo "$REPO" < "$P8"
printf '%s' "$KEY_ID" | gh secret set APPLE_API_KEY_ID --env release --repo "$REPO"
printf '%s' "$ISSUER" | gh secret set APPLE_API_ISSUER --env release --repo "$REPO"
gh secret list --env release --repo "$REPO" | grep -E "MAC_CERT|APPLE_API" || true
unset P12_PASS

read -r -p "Delete the exported .p12 now? It stays in your keychain. [Y/n] " del
if [[ "${del:-Y}" =~ ^[Yy]$ ]]; then rm -P "$P12" 2>/dev/null || rm -f "$P12"; echo "Deleted $P12."; fi

read -r -p "Run a signed build and verify it now (takes several minutes)? [y/N] " build
if [[ "${build:-N}" =~ ^[Yy]$ ]]; then
  cd "$(dirname "$0")/.."
  export APPLE_API_KEY="$P8" APPLE_API_KEY_ID="$KEY_ID" APPLE_API_ISSUER="$ISSUER"
  npm ci
  npm run dist:mac:signed
  for app in release/mac*/SuperTokenMan.app; do npm run verify:mac -- "$app"; done
  say "Signed, notarized and verified. Keep the .p8 outside the repository."
fi
say "Done."
