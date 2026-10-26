# Security

Please report a vulnerability privately, through GitHub's **Report a vulnerability** (Security tab of
this repository), not in a public issue. Include the version, what you did and what happened.

You get an answer within 7 days. A fix goes into the next signed release, with credit if you want it.

In scope: the app (`app/`), `token-kit/`, and the release builds. Out of scope: Claude Code, the
Anthropic API and third-party services the app connects to; report those to their owners.

What the app is built to hold:
- Secrets live in the macOS keychain and the main process; the window never receives a secret's value.
- Content from outside (web pages, tool results, email) is treated as data; text in it that tries to
  give orders is flagged and Claude is told so.
- Actions that reach outside (posting, sending, deploying, stopping cloud resources) need a click and a
  confirm; there is no auto-reply and no automatic posting.
- Release builds are signed with a Developer ID, notarized by Apple, and ship with SHA-256 checksums.
