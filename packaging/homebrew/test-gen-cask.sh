#!/usr/bin/env bash
# Tests gen-cask.sh: right hashes per arch, valid Ruby, and failure on a missing dmg.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
a=$(printf 'a%.0s' {1..64}); b=$(printf 'b%.0s' {1..64})
printf '%s  SuperTokenMan-arm64.dmg\n%s  SuperTokenMan-x64.dmg\n%s  SuperTokenMan-9.9.9-mac.zip\n' "$a" "$b" "$a" > "$tmp/sums"
bash "$here/gen-cask.sh" 9.9.9 "$tmp/sums" > "$tmp/c.rb"
grep -q 'version "9.9.9"' "$tmp/c.rb"
grep -q "arm:   \"$a\"" "$tmp/c.rb"
grep -q "intel: \"$b\"" "$tmp/c.rb"
if command -v ruby >/dev/null; then ruby -c "$tmp/c.rb" >/dev/null; fi
grep -v x64 "$tmp/sums" > "$tmp/short"
if bash "$here/gen-cask.sh" 9.9.9 "$tmp/short" >/dev/null 2>&1; then echo "FAIL: missing dmg accepted"; exit 1; fi
if bash "$here/gen-cask.sh" v9.9.9 "$tmp/sums" >/dev/null 2>&1; then echo "FAIL: bad version accepted"; exit 1; fi
echo "gen-cask: ok"
