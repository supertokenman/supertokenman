cask "supertokenman" do
  arch arm: "arm64", intel: "x64"

  version "0.1.7"
  sha256 arm:   "27991367dcc2faefb900cad515e140010cb23b20eb457b8f6e14a3a260bf3885",
         intel: "2f770eddbd482e77753739a78edaebe4b9506e07126ff76dbf520ca9a54530d3"

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
