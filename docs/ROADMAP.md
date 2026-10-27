# Roadmap

One release at a time. Each feature ships with a test, an empty state, and a line in
`docs/NETWORK.md` if it reaches the network. Performance changes ship with a before and after in
`docs/PERFORMANCE.md`, measured the same way.

## v1.0: the launch (now)

- [x] Signed and notarized builds, SHA256SUMS, build attestation, auto-update from GitHub Releases.
- [x] Public source (FSL-1.1-ALv2), CI with gitleaks, OSV-Scanner, Semgrep and the network watch.
- [x] UI pass (tooltips, controls, panels as cards, guides as steps, folder picker) and the sweep's bugs.
- [ ] Release 0.1.5 with the above.
- [ ] Mac proof report in `docs/security/`, from the run with `--mitm`.
- [ ] 30 second demo video; a 404 page for the site.
- [ ] Launch posts from `docs/launch/KIT.md`.
- [ ] A legal reading of the Claude Agent SDK terms before anything is charged.

## v1.1: fast and light, nothing new

No features. The app should open at once, sit at zero work while idle, and stay small, without
losing anything it does today.

Budgets, measured on an Apple silicon Mac with a fresh profile (to be confirmed with a first
measurement, then held in CI where a number can be measured there):

- Launch to a usable composer: under 1 s with a warm disk.
- Idle window: 0 layouts and 0 style recalcs per second, and near 0% CPU, with four panels open.
- Renderer start-up bundle: under 250 KB gzip.
- Memory: a set number per open panel, measured and written here, then not allowed to grow.
- Typing, scrolling a long transcript, opening a sheet: no frame over 16 ms.

Work:

- Measure first: a `perf` script that launches the built app, records the marks above and writes
  them to a file, so every change has a before and after.
- Start-up: V8 snapshot or code cache for the main process, defer every module the first panel does
  not need, show the window from a cached first frame.
- Renderer: virtualize long transcripts and tables, move token counting and markdown parsing off the
  main thread, keep heavy sheets lazy.
- Processes: one utility process for background work instead of timers in the main process; batch
  IPC; stop polling where an event exists.
- Size: drop unused dependencies and locales, check the app bundle size per release.

References to read before choosing (what they did, not claims about us):

- Electron's own performance checklist (electronjs.org/docs/latest/tutorial/performance).
- VS Code's start-up work: code cache, lazy contributions, the start-up performance report.
- Zed and Linear for latency targets and how they talk about them.
- Chrome DevTools Performance and `--trace-startup` for the measurements.

## v1.2: features

- Isolated commands.
- Remote panel: the rest.
- GitHub inside the app, in our own screens (not the github.com page in a web view): pull requests,
  issues, CI status with the failing log, review comments. Signed in with the `gh` login already on
  the Mac. Tied to panels: open the PR of a panel's branch, send a failed check or a review comment
  to the panel, reply from the app. "Open on GitHub" for anything not covered. Every endpoint goes in
  `docs/NETWORK.md`, and nothing is called until the user turns it on.
- Issue to panel for GitLab, Linear and Jira, with a comment back.
- MCP: OAuth, per-persona servers, health check interval.
- Check after edits on the touched files; fan-out lint and typecheck.
- Compression: correctness.
- Past sessions indexed and searchable.
- Structure: one icon set, design tokens, typed IPC, branded fields.

## Later

- Codex (OpenAI) panels, once users ask for them.
- UI backlog leftovers (`docs/UI-BACKLOG.md`): empty sheets, copyable commands, left edges, one accent.
- Vault passwords URL-encoded in database connections; single-step guides without "0 of 1"; the
  Ollama next-step banner.
