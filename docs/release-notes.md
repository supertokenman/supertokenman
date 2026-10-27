Typing without the stutter, and three new tools for social media.

- Typing in the composer no longer makes the whole window recalculate its layout on every key (three
  times per key before, once now). The composer grows with its text the same way as before.
- Research > Last 30 days: what people posted about a topic or a public handle, from Reddit, YouTube,
  Hacker News and GitHub, ranked by real engagement and summed up in a short brief, with a button to
  draft a post from it. Reddit and YouTube use your own keys from the vault.
- News: subscribe through your own RSSHub instance, and paste any page to pick from the feeds it lists.
- The apps drawer takes any site as an app, with its own sign-in, its icon and optional CSS.
- New network calls are listed on the Security page; each runs only when you use the feature.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
