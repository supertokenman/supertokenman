A fix for Intel Macs, where no panel could start.

- On Intel Macs, New panel did nothing: the Intel build shipped without the Claude binary for Intel,
  so every new panel failed to start. The Intel build now carries its own binary, and the release
  check fails if a build lacks the binary for its cpu. Apple silicon builds already carried theirs.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
