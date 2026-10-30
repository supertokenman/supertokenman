Panels can keep running after you close the window, and team files work again.

- Keep panels running (Settings, off by default): with a panel at work, closing the window or Cmd+Q
  leaves it running in the menu bar, with the count, today's cost, Stop all and Quit and stop all.
- Each panel's dot shows its state: working, waiting for you, idle, stopped or not started. Panels
  that ask you something or stopped on an error show in Needs you.
- Reopen the window and panels still running come back with their recent output.
- After a crash or restart with panels open, a strip offers to resume them.
- Update with panels at work asks first: Restart now, or install when you quit.
- Rules for what panels may do: a rules file (global, or .stm/policy.rules in a project) can deny,
  ask or allow tools by command, path or network use. No rules file exists by default, so nothing
  changes until you write one; a broken rule asks, it never allows.
- An audit log of every tool decision and approval, kept 90 days on this Mac, with secrets masked.
- A restore point at the end of each turn in a git project, kept outside your branches.
- Limits on automation: timed triggers and webhooks run at most every 5 minutes, at most 20 are on at
  once, and one that fails 10 times in a row turns itself off with a note.
- Save team file, Open team file and its Apply did nothing useful since 0.1.19: the Export team menu
  item used the same internal channels, so the team file actions ran the wrong code or failed. Each
  now has its own, and a check fails the build if two actions ever share one again.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
