Faster and lighter, costs that match Anthropic's prices, and every Claude Code model.
This release also carries 0.1.10, which was built but not published.

- Costs: each model now has its exact price. Before, Haiku 5.5 was costed at ten times its price,
  Opus 5.5 and Sonnet 5.5 too high, and Fable 5.1 too low.
- Models: the model button opens our own menu with Opus 5.5, Fable 5.1, Sonnet 5.5 and Haiku 5.5,
  older models under More models, and only the effort levels the chosen model supports.
- The app opens faster: it no longer waits for your login shell before showing the window, and the
  terminal, preview and secondary sheets load only when you open them.
- Long sessions scroll smoothly: past 300 items only the part on screen is drawn.
- An idle window does less: clocks and polls pause while the window is hidden.
- Smaller download: only English, Portuguese and Spanish system files, and no build leftovers.
- The "+" in the composer opens a file picker in the app's own look, with Finder one click away.
- A new dark opening screen with the mark in motion, so there is no white flash at launch.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
