Panels are cards now, and a narrow panel no longer cuts its tabs.

- Panels sit apart as cards, with the 45 degree corner; the focused one has an accent edge.
- In a narrow panel the tabs and the close button always show whole; the folder name keeps its room.
- Switching the model of a panel that was asleep no longer fails with "Query closed before response
  received"; the panel wakes with the new model.
- token-kit: the permission rule now matches the hook when `~/.claude` is a symlink.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
