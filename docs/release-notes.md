A fix for 0.1.12: no network call at launch.

- The update check is now off until you turn it on in Settings, and it never runs while the app is
  starting. In 0.1.12 (and earlier) it ran at every launch; on our 0.1.12 Mac proof one of its
  requests to github.com left before the test proxy was set, so the proof failed. The details are in
  docs/security/2026-10-28-mac-0.1.12/REPORT.md. The Update button in Settings still checks when asked.
- Everything else from 0.1.12 is unchanged: our own controls, `stm top`, `stm` inside panels and
  video transcripts.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
