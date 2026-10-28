A fix for a black window after updating.

- Right after an update the app could start before its files were all in place and stay black, with
  nothing in the log. It now shows "Starting SuperTokenMan...", tries again on its own a few times,
  writes the miss to the log, and if it still cannot read its files, says to quit and open it again.
- Everything else from 0.1.17 is unchanged: the canvas, stm read, link cost and cap, the review loop
  and stm learn.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
