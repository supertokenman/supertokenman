#!/usr/bin/env bash
# Writes the Homebrew cask for SuperTokenMan to stdout.
# Usage: gen-cask.sh <version without v> <path to SHA256SUMS>
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <version> <SHA256SUMS>" >&2; exit 2; }
version=$1 sums=$2
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "bad version: $version" >&2; exit 2; }
sha() {
  local s
  s=$(awk -v f="$1" '$2 == f || $2 == "*" f { print $1 }' "$sums")
  [[ $s =~ ^[0-9a-f]{64}$ ]] || { echo "no sha256 for $1 in $sums" >&2; exit 1; }
  printf '%s' "$s"
}
arm=$(sha SuperTokenMan-arm64.dmg)
intel=$(sha SuperTokenMan-x64.dmg)
cat <<CASK
cask "supertokenman" do
  arch arm: "arm64", intel: "x64"

  version "$version"
  sha256 arm:   "$arm",
         intel: "$intel"

  url "https://github.com/supertokenman/supertokenman/releases/download/v#{version}/SuperTokenMan-#{arch}.dmg",
      verified: "github.com/supertokenman/supertokenman/"
  name "SuperTokenMan"
  desc "Claude Code client with parallel panels, approvals and per-turn cost"
  homepage "https://supertokenman.com"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :monterey"

  app "SuperTokenMan.app"

  zap trash: [
    "~/Library/Application Support/SuperTokenMan",
    "~/Library/Caches/dev.arimayuji.supertokenman",
    "~/Library/Caches/dev.arimayuji.supertokenman.ShipIt",
    "~/Library/Caches/supertokenman-app-updater",
    "~/Library/HTTPStorages/dev.arimayuji.supertokenman",
    "~/Library/Logs/SuperTokenMan",
    "~/Library/Preferences/dev.arimayuji.supertokenman.plist",
    "~/Library/Saved Application State/dev.arimayuji.supertokenman.savedState",
  ]
end
CASK
