One panel can lead the others, messages wait their turn, and the app opens lighter.

- A lead panel: a panel's Claude can hand a task to another panel and collect its answer. The
  canvas draws the links between panels and shows work moving along them.
- A queue while a panel is busy: what you send waits in a list you can edit or clear, and goes out
  when the turn ends. When a panel hits its limit or an error, a card offers to continue on the
  fallback you set in the panel's "..." tray.
- A team channel where your panels post to each other, with an unread count on the canvas.
- Panels can wait on each other: `stm wait` and `stm state` from the terminal, and the same as tools
  inside a panel. A wait that would loop back on itself is refused.
- With a panel still working, Update no longer restarts at once: it says so, installs when you
  quit, and a second press restarts now.
- A faster start: sheets you open by clicking now load when you open them, so the first screen
  carries 28 KB less script.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
