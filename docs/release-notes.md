A lead panel and its workers you can tell apart, screens for rules and Packs, and quieter notes.

- Ask a panel for "an orchestrator with two workers" and it becomes the lead: the workers open with
  their titles, linked to it, and the canvas fans them out to its right. The lead's header shows the
  team and each worker's state; a worker's header says whose it is, and the task it got is the first
  thing in it. A task sent to a worker that never starts now fails after 90 s with the reason,
  instead of waiting.
- Rules, audit log and restore points get their screens: a rules editor that warns about rules that
  allow too much and can test a call, an audit log you can filter, a plan strip under each panel,
  restore to an earlier turn and breakpoints from the panel's tray, and limits for automation.
- Packs: browse, review everything a pack adds before it installs (files, tools and their command
  lines, hosts, credentials, rules), install, update with a per-file review, roll back, remove, and
  compare a task with and without a pack side by side.
- Notes about a turn being slow or costly appear only when it is really unusual: time spent waiting
  for you or for other panels no longer counts, and slow-turn notes are off by default (Budget).

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
