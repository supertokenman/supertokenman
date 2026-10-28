Asks once whether to check for updates.

- On first launch after the splash and the Tour, a small card asks whether the app may check
  github.com for a new version: a minute after launch, then every 6 hours. Nothing downloads until you
  choose Install. "Not now" keeps it off; you can change it any time in Settings > Appearance. The card
  itself sends nothing.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
