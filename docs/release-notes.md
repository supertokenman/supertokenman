A smaller download and much less memory with several panels open.

- A panel's Claude Code process now starts when you first use the panel, not when it opens. With
  four idle panels the app used about half the memory in our tests. The first message in a new
  panel takes about a second longer; the process starts as soon as you begin typing.
- The Claude Code program is no longer inside the app download, which makes the app about half the
  size. On first launch the app fetches the exact version it was built with from the npm registry,
  checks its checksum before using it, and shows the progress. If you already have that same
  version installed, it uses yours. Settings shows which one is in use.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
