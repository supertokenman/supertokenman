Our own controls everywhere, and a live dashboard in the terminal.

- Every menu, checkbox, switch, number field, slider, tooltip and confirmation in the app is now our
  own design instead of the macOS default, in both themes and with the keyboard. Opening and saving
  files go through the app's own pickers; Finder stays one click away with "Use Finder...".
  The menu bar, notifications and macOS permission prompts stay the system's own.
- `stm top`: a live view in the terminal of every open panel, its state, today's cost, approvals
  waiting and CI. `stm top --once --json` prints one snapshot for scripts. Local only, no network.
- Claude inside a panel can now use `stm`: open a linked panel, send a message to another panel, and
  share notes in the project. A message from another panel waits in the composer until you press send.
- Video transcripts (off until you turn them on): paste a transcript, give a subtitle file, or run an
  audio or video file through your own whisper.cpp. The app does not fetch YouTube captions.
- The Mac performance report now shows the first launches after install apart from warm launches,
  so a slow first start no longer reads as a regression.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
