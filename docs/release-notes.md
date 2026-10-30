A fix for team files.

- Save team file, Open team file and its Apply did nothing useful since 0.1.19: the Export team menu
  item used the same internal channels, so the team file actions ran the wrong code or failed. Each
  now has its own, and a check fails the build if two actions ever share one again.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
