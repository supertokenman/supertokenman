Ask a panel to set up your window, schedule posts, and dictate into any app.

- Ask for a layout and it happens: a panel's Claude can open panels in the folders you name, switch
  to the canvas, link panels and arrange them. Opening panels starts new sessions, so a sheet lists
  them and nothing opens until you press Allow.
- Dictate anywhere: press Option+Shift+D, speak, press again, and the text is pasted where your
  cursor is, in any app. Transcription runs on this Mac with a local whisper.cpp engine; nothing is
  sent anywhere. Off by default; Settings shows how to set up the engine and the macOS permissions.
- Social: a posting queue with weekly time slots per network and per account, best time and hit
  share from your own measured posts ("Not enough data yet" below the minimum), a rewrite reviewed
  per network, Mentions triage, evergreen suggestions, several accounts per network grouped in
  projects with a brand kit, a hook library and niche import. Scheduled posts go out only while the
  app is open; very late ones wait for you.
- Lighter when idle: the start screen no longer redraws on every focus change, and the music
  player stops polling while the window is in the background.
- A cleaner top: a small "Reopen N panels" pill instead of the banner, and the less used panel
  controls behind a "..." button. The Needs you list fits long titles.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
