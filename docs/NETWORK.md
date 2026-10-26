# What talks to the network, and when

The source for the Security & Privacy page. Last reviewed: 2026-10-25.

## How this was checked

- `npm run netwatch:check` opens the built app with a clean profile for 60 seconds, nothing clicked, and
  logs every `fetch`, `http(s)` request, Electron `net` call, child process and window request
  (`app/scripts/netwatch.mjs`). It fails on anything outside the allowed list in
  `app/scripts/netwatch-check.mjs`. Result on 2026-10-25: 17 attempts, all allowed.
- The run was on Linux, not on a Mac. Mac-only paths (Keychain, `system_profiler`, the native spell
  checker) were not exercised.
- Chromium's own requests outside the app's sessions are not covered by the wrappers. On Linux, Chromium
  fetched spell-check dictionaries from `redirector.gvt1.com` (Google); on macOS Electron uses the system
  spell checker, so this should not happen there (not verified on a Mac).
- Requests made after a click were read in the code, not each one exercised.
- On a Mac, `bash app/scripts/proof-mac.sh` checks the released dmg (checksums, attestation, signature,
  notarization), runs it with its own profile while a person uses it, logs where the app and every
  process under it connect (`lsof`, twice a second), and looks for a decoy secret put in the vault on disk
  and, with `--mitm`, in the traffic. Reports go to `docs/security/` once run.
- Child processes (`claude`, `git`, `docker`, cloud CLIs) are recorded when they start, not where they
  connect: their own traffic is outside what the check proves. Claude Code's is set as described below.

## With nobody asking

| What | Where | When |
|---|---|---|
| Claude Code | Anthropic, through the `claude` CLI and your own login or key: your messages and Claude's replies, under Anthropic's terms and privacy policy | when a panel runs |
| Claude Code's own usage data and error reports | Anthropic | off: the app sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` for its panels; on with Appearance > Let Claude Code send usage data to Anthropic, or with your own value of that variable |
| Local checks | none (git, `docker ps`, `docker stats`, `openshell --version`, `officecli --version` on this Mac) | at launch and on timers |
| Update check (released builds) | GitHub Releases of `supertokenman/supertokenman` (`latest-mac.yml`) | at launch and every 6 hours; off with Appearance > Check for updates automatically; downloads only when you say Install |
| Source update check | your git remote (`git fetch`) | every 6 hours, only in an app installed from a source checkout |

No telemetry, analytics or crash reports are sent to us; there is no server of ours.

## Only after you turn it on or ask

| What | Where | Turned on by |
|---|---|---|
| Exchange rate | api.frankfurter.dev | Spend > Update rates |
| GitHub stars of integrations | api.github.com | Connections > Show GitHub stars |
| Pull requests, CI, triggers, repo secrets (names) | api.github.com | the GitHub integration in Connections; signs in with the vault token or your `gh` login |
| Feeds and briefing | the feeds you add | adding a feed; the briefing schedule is off by default |
| Cloud resources | AWS, Google Cloud, DigitalOcean, Fly.io, Supabase, Neon (through their CLIs or vault tokens) | opening Cloud, "Look in the cloud" in the terminal, or the "Check every 6 hours" switch |
| Integrations and MCP servers | the service each one names | turning it on in Connections |
| Monitors, Prometheus, PostHog, local model servers, storage | the addresses you enter | adding them |
| Web reader, embedded videos, web apps | the page you open | opening it |

The release update check runs only in a packaged Mac build that carries `app-update.yml`; netwatch runs
the unpackaged app, so it does not exercise it (not verified until the first signed release).
