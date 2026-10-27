A faster start, a file picker of our own, and a new opening screen.

- The app opens faster: it no longer waits for your login shell before showing the window, and the
  terminal, preview and secondary sheets load only when you open them (start-up code is about half
  the size).
- The "+" in the composer opens a file picker in the app's own look: files of this project, recent
  files, and folder browsing, with search, thumbnails and multi-select. Finder is one click away.
- A new dark opening screen with the mark in motion, the same dark as the window, so there is no
  white flash at launch. It stays still when Reduce motion is on.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
