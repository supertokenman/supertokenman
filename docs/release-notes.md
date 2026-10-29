A fix for updates that stopped at "Restarting".

- Installing an update could stop at "Restarting. Reopens by itself." and never restart: the
  window's closing animation held the close, and that cancelled the quit that installs the update.
  Force quitting then could leave a black window. The update now restarts, every update step is
  written to the log, and if the app has not restarted after a minute it says so and links to the
  releases page.
- If you are stuck on an older version, download this one from the releases page once; later
  updates install from inside the app.
- Also in this version: `stm ask` between linked panels, teams as one Markdown file (File, Export
  team... and Import team...), and the "While you were away" card.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
