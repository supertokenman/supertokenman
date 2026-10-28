More say over what agents do, and what they claim.

- Permission cards: Edit and run changes a command before it runs (checked and isolated like the
  original), and Deny with a note tells the agent what to do instead.
- Limits per trigger: a scheduled run can be held to the folders it may read or write and the
  commands it may run. Anything outside is refused, not asked; each command in a chain is checked.
- Evidence on claims: when a reply says fixed, passing or faster, the panel marks whether a test,
  build or measurement ran in that turn after the last edit. It does not read whether it passed.
- `stm files export` and `stm files import`: personas and triggers as files in the project, for git.
  Import shows what would change and applies only with `--yes`; imported triggers arrive off.
- CI now also runs the first-run update question and loop detection checks on every change.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
