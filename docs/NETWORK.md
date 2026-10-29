# What talks to the network, and when

The source for the Security & Privacy page. Last reviewed: 2026-10-27.

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
- The `proof-mac` workflow does the same with nobody at the keyboard after each release, and fails when
  the app's own processes reach a host name that is not written on this page (see docs/RELEASE.md).
- Child processes (`claude`, `git`, `docker`, cloud CLIs) are recorded when they start, not where they
  connect: their own traffic is outside what the check proves. Claude Code's is set as described below.

## With nobody asking

| What | Where | When |
|---|---|---|
| Claude Code | Anthropic, through the `claude` CLI and your own login or key: your messages and Claude's replies, under Anthropic's terms and privacy policy | when a panel runs |
| Claude Code's own usage data and error reports | Anthropic | off: the app sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` for its panels; on with Appearance > Let Claude Code send usage data to Anthropic, or with your own value of that variable |
| stm from inside a panel (`stm whoami`, `spawn`, `send`, `note`, `link`) | none: the app's local socket only (`cli.sock` in the app's data folder, or a named pipe on Windows); no new hosts | when a panel's Claude Code runs it |
| Local checks | none (git, `docker ps`, `docker stats`, `openshell --version`, `officecli --version` on this Mac) | at launch and on timers |
| Source update check | your git remote (`git fetch`) | every 6 hours, only in an app installed from a source checkout |

No telemetry, analytics or crash reports are sent to us; there is no server of ours.

## Only after you turn it on or ask

| What | Where | Turned on by |
|---|---|---|
| Webhook triggers | none: a local listener on 127.0.0.1 port 47821 only, nothing beyond this machine; no host is called. Each trigger has its own token (kept in the vault); the body reaches the run marked as untrusted data | off by default: listens only while at least one trigger has Start from a local webhook on |
| Update check (released builds) | GitHub Releases of `supertokenman/supertokenman` (`releases.atom`, `latest-mac.yml`): github.com, release-assets.githubusercontent.com, objects.githubusercontent.com | off by default since 0.1.13: the Update button checks when you press it; with Appearance > Check for updates automatically on, a minute after launch (never during it) and every 6 hours; downloads only when you say Install. A fresh profile (or an upgrade with the setting unset) asks once after launch, after the splash and the Tour: "Check for updates" turns it on, "Not now" keeps it off; the question itself makes no request |
| Exchange rate | api.frankfurter.dev | Spend > Update rates |
| Panel browser | Only the pages you or the agent open in a panel's Preview (or the Playwright server). Each panel has its own sign-ins (`persist:panel-<id>`, and `panel-browsers/<id>` under the app's data for Playwright), apart from your own browser; Clear sign-ins or closing the panel wipes them | opening a page |
| Market quotes and predictions | query1.finance.yahoo.com, brapi.dev, api.coingecko.com, gamma-api.polymarket.com | opening Markets (every minute while it is open) |
| Symbol lookup | query1.finance.yahoo.com (`/v1/finance/search`, what you typed) | typing in Markets > Add, after a pause, only when the built-in list has fewer than five matches |
| GitHub stars of integrations | api.github.com | Connections > Show GitHub stars |
| Pull requests, CI, triggers, repo secrets (names) | api.github.com | the GitHub integration in Connections; signs in with the vault token or your `gh` login |
| Feeds and briefing | the feeds you add | adding a feed; the briefing schedule is off by default |
| Feed discovery and RSSHub routes | the page you paste (and its `/feed`, `/rss.xml`, `/atom.xml`, `/feed.xml`, `/index.xml`, `/rss`, `/feed.json` when it names no feed); a route goes to the RSSHub instance you set in News > Rules and more (empty by default; https://rsshub.app is the public one) | adding a feed or a route |
| Research and the Last 30 days brief | hn.algolia.com, api.github.com; Reddit (www.reddit.com for the app-only token, oauth.reddit.com for search) with your own Reddit app's client id and secret from the vault; YouTube Data API v3 (www.googleapis.com) with your own YOUTUBE_API_KEY; Anthropic through Claude Code for the brief | running Research or Make the brief; Reddit and YouTube are skipped until you add their credentials |
| Cloud resources | AWS, Google Cloud, DigitalOcean, Fly.io, Supabase, Neon (through their CLIs or vault tokens) | opening Cloud, "Look in the cloud" in the terminal, or the "Check every 6 hours" switch |
| Integrations and MCP servers | the service each one names | turning it on in Connections (none is on by default since 0.1.7; up to 0.1.6 a new profile started with Context7 and Cloudflare docs on) |
| Monitors, Prometheus, PostHog, local model servers, storage | the addresses you enter | adding them |
| Web reader, embedded videos, web apps | the page you open | opening it |
| Video transcripts | none from the app: it reads a subtitle or audio file you give, or text you paste. A link other than YouTube runs **your own** `yt-dlp` (not shipped by us) on this machine; that tool contacts the video's site under your responsibility, captions only, never with browser cookies. Audio goes to **your own** `whisper.cpp` (and `ffmpeg`) locally. YouTube links are not fetched at all | Settings > Appearance > Video transcripts (off by default), then Transcript or `stm transcript` |
| Bluesky: the server you sign in to (bsky.social by default) | Accounts: sign-in when you connect (only the session is kept, not the app password). Post everywhere: one post, with a rewritten version per network when you accepted one. Scheduled posts: an approved queue item goes out at its time. Best time, Hit share and Evergreen: your own recent posts, read when you open them or click. Mentions: your notifications, the post a mention replies to, a reply | connecting Bluesky in Accounts; a post only when you press Post and confirm, or when an approved scheduled post is due while the app is open; Mentions polls only while on (every 2 minutes by default, 1 at least, less often after errors, stops when the app quits) and replies only when you click Approve |
| Mastodon: the instance you name | Post everywhere: one post (or the rewritten version for this network). Scheduled posts and your own recent posts for Best time, Hit share and Evergreen, as for Bluesky. Mentions: your mention notifications, the post a mention replies to, a reply | connecting Mastodon in Accounts; then as for Bluesky |
| api.x.com | Post everywhere and scheduled posts: `/2/tweets`. Your own recent posts for Best time, Hit share and Evergreen, only when you click. Mentions: `/2/users/:id/mentions`, and `/2/tweets` for a reply. Your own keys | connecting X in Accounts; then as for Bluesky (reading mentions needs a paid tier on X) |
| api.linkedin.com | Post everywhere and scheduled posts: `/v2/userinfo`, `/rest/posts` | connecting LinkedIn; only when you press Post and confirm, or when an approved scheduled post is due while the app is open |
| api.telegram.org, discord.com (your webhook), dev.to | Post everywhere: one message, webhook post or article | connecting each in Accounts; only when you press Post and confirm; `stm post` only opens the sheet |
| Sites added as drawer apps | the site's own address and the extra hosts you list; its icon once, from the same site, when you add it | adding the site, then opening it |

Scheduled social posts go out **only while the app is open** and the Mac is awake: the queue is checked
every minute inside the app, there is no background agent, and nothing posts while the app is closed.
After sleep or a restart, a post that is a little late goes out and one that is very late is held until
you choose Post now, Move or Skip. The small-model helpers (rewrite per network, hook fill, evergreen
rewording, niche classify, Mentions triage) call no social host: each runs the small-model path only when
you click its button (triage only while switched on), and nothing they write is posted without Approve. A
picked CSV, JSON or text file for Niche import is read on this Mac (up to 2 MB); links in it are never
opened. No host is added by these features.

The release update check runs only in a packaged Mac build that carries `app-update.yml`. Since 0.1.13
netwatch forces the app's release path (`STM_UPDATE_RELEASE_MODE=1`, the automatic check's wait cut to
2 s), so a fresh profile that reaches GitHub on its own fails CI on Linux too; electron-updater itself
still runs only in the signed build, which only the Mac proof covers.
