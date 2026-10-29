Panels that talk in a room, and a few things set up in one step.

- Group room on the canvas: one message to the linked panels; the panel named with @name answers,
  and "Next turn" passes the question and last reply on. Each turn goes over a link and is charged
  to it, with the usual approvals.
- Triggers from a local webhook: turn it on for a trigger and a POST to 127.0.0.1:47821 with that
  trigger's own token starts it. Nothing listens beyond this Mac; the payload reaches the run as data.
- A browser per panel: sign-ins in a panel's browser stay in that panel, apart from your own browser.
  Clear sign-ins, or close the panel, to wipe them.
- Usage per panel: a chip shows the session's cost, tokens and the rate-limit windows the CLI reports
  ("not reported" when it says nothing). Set a cap and the next message waits for you.
- New project from a template: web app, CLI tool, data analysis or docs site writes a persona, skills
  and CLAUDE.md in one step, keeping files already there. In the File menu and as `stm new`.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
