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
- Memory: about 280 MB of resident memory per open panel (Linux, 2026-10-27: 270 MB is the panel's
  Claude Code process, 8 MB the app's own, 0.2 MB renderer JS heap), then not allowed to grow; CI fails
  above 450 MB.
- Typing, scrolling a long transcript, opening a sheet: no frame over 16 ms.

Work:

- Measure first: `app/scripts/perf-mac.mjs`, run on each release by the `perf-mac` workflow, records
  the marks above to `perf.json` and compares with the previous release, so every change has a before
  and after. How and where: docs/PERFORMANCE.md, "Measured on each release".
- Start-up: V8 snapshot or code cache for the main process, defer every module the first panel does
  not need, show the window from a cached first frame.
- Renderer: virtualize long transcripts and tables, move token counting and markdown parsing off the
  main thread, keep heavy sheets lazy.
- Processes: one utility process for background work instead of timers in the main process; batch
  IPC; stop polling where an event exists.
- Paced work: fan-out attempts and trigger runs start as the Mac can take them (CPU and memory), with
  retries that back off, instead of all at once. Only if the measurements show many panels at once
  hurt. Idea from Crawlee's autoscaled queue.
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
- Trace: a tab per panel that lays the session out step by step (each tool call, its tokens, cost and
  time), so it is clear where the money and the minutes went. Local only. Idea from MLflow tracing.
- The app's own MCP server, local only: costs, tasks, memory and CI status, so Claude in a panel can
  ask "what did this project cost today?" or "which tasks are open?". Idea from OpenSEO's MCP.
- An `stm` command line with JSON output and documented exit codes (open a panel, list sessions,
  costs), for people and agents. Google Workspace through the `gws` CLI and the login already on the
  Mac, the same way GitHub uses `gh`. Idea from googleworkspace/cli.
  It ships with a Claude Code skill that teaches any agent to drive the app through `stm` ("open a
  panel in repo X and run the tests"), published on its own so it works for people without the app.
  Idea from Qinglong's remote CLI and agent skill.
- Triggers: a list of finished runs with when, how long, the result and a link to the panel's
  transcript. Today a run opens a panel and only unfinished runs are listed.
- News in the terminal: `stm news` prints the unread headlines from the feeds already in News, one
  per line with source and link; `stm news --open 3` opens one. The app's MCP server also serves the
  feeds, so Claude in a panel can answer "what's in the news today?". No new network calls: the feed
  fetches are already in `docs/NETWORK.md`.
- MCP: OAuth, per-persona servers, health check interval.
- Check after edits on the touched files; fan-out lint and typecheck.
- Compression: correctness.
- Past sessions indexed and searchable.
- Import docs: paste a docs site, the app crawls it (robots.txt respected, a page limit, identified as a
  bot, no anti-bot evasion) and keeps the text in the project's Memory or Documents, so Claude reads it
  locally instead of fetching the web each turn. Runs only when asked; each host goes in
  `docs/NETWORK.md`. Idea from Crawlee.
- Structure: one icon set, design tokens, typed IPC, branded fields.
- Agents working together, in this order (ideas from Orca, Agent Orchestrator, Nodeterm, OpenCove,
  Hivemind and Maestri, reviewed 2026-10-27; features as their own pages describe them, not tested by us):
  1. One git worktree and branch per panel, so panels running in parallel never edit the same files,
     and each ends in its own pull request.
  2. Loops back to the panel: a failed CI check, a review comment or a merge conflict on a panel's pull
     request goes to that panel. CI failures can go automatically; the rest ask first. Builds on
     "GitHub inside the app" above.
  3. Canvas view: panels, notes and previews loose on a pan and zoom canvas, next to today's grid.
     Links between panels let one read another's summary (read only, sent when you press send unless
     you turn on auto for that link). Every link shows its tokens and cost and has a spending cap, which
     none of the apps above show. Each panel stays a real Claude Code session on the user's own login:
     no API key and no new network calls.
     Step done (2026-10-28): stm from inside a panel. Each panel's Claude Code gets STM_CLI,
     STM_SOCKET, STM_PANEL_ID and a per-panel key, and can run stm whoami, panels, spawn, send
     (queued in the other composer unless the person turns on auto for that link), note and
     link/links; rate-limited and logged. See "Using stm from inside a panel" in docs/STM_GUIDE.md.
     Step done (2026-10-28): stm read <panel> gives a linked panel's goal and the end of its last
     reply, credentials masked; unlinked panels cannot read each other.
     Step done (2026-10-28): each link counts today's cost, tokens and turns of the turns its messages
     started, with a daily cap set from the window.
     Step done (2026-10-28): the Canvas layout. Layout: Canvas puts the panels as cards on a pan and
     zoom surface (drag a header to move a card, drag the background or Space+drag to pan, Ctrl/Cmd +
     wheel or pinch to zoom 30% to 150%, Fit frames all cards); spots and view are kept in local
     storage. Links are drawn under the cards, once per pair, labelled auto or waits and with today's
     cost when the link carries it. Geometry lives in app/shared/canvas.ts with tests.
     Still to come: notes and previews as cards, and resizing cards.

## After v1.1: from the repo review of 2026-10-27

Ideas taken from other open-source projects, in the order to build them once v1.1 (performance) is
done. Ideas only, no code. Each one ships with a test, an empty state and its `docs/NETWORK.md` line.

1. Repository storefront (GitHub): website and topics set, Discussions on, CONTRIBUTING, code of
   conduct, issue and PR templates, a picture and the live demo link at the top of the README, CI and
   Mac proof badges; read and answer the open issues. On the site: "No server of ours: you use your own
   Claude plan." (Puter)
2. Launch channels in `docs/launch/KIT.md`: awesome-claude-code and similar lists, GitHubDaily,
   HelloGitHub, Product Hunt, TLDR, Console.dev, Changelog, each with its link and text. (GitHubDaily)
3. Done: `stm top`, a live terminal dashboard of panels, costs, approvals waiting and CI, next to `stm` and
   `stm news`. (World Monitor)
4. Triggers on events, not only on a clock: a monitor down, CI red, a feed item matching a filter, a
   file in a folder. Each run opens a panel and still asks before edits and commands. Plus a daily
   digest of trigger notifications instead of one interruption each. No inbound webhooks. (Huginn)
5. A daily news brief written from the user's feeds at a chosen hour, if the briefing setting does not
   already do it. (World Monitor)
6. Observability: export turns over OTLP to any collector (SigNoz, Jaeger, Tempo, Honeycomb), not only
   Langfuse; off until an endpoint is set. Correction: the v1.2 "Trace" item is mostly the existing
   Observability sheet; it becomes "improve it": a command's output and time inside its span, and the
   CI run a turn started. (SigNoz)
7. API Client in files: requests saved in the project (`.supertokenman/requests/`, readable and
   editable by Claude), import from Postman, Insomnia, Bruno and OpenAPI, environments whose secrets
   come from the vault and never land in the file, and a collection run with assertions from `stm` or a
   trigger. Public APIs list: key/HTTPS/CORS tags and a filter, a dated "update list" button, and
   requests created with the MCP. (Bruno, public-apis)
8. Support to code: from a OneInbox message, "this is a bug" opens a panel in the right repo with the
   message; the reply draft says which version fixed it. Claude drafts replies from Memory, docs and
   code, sent only after approval. Saved replies and labels. Integrate with Chatwoot's API rather than
   copy its team features. (Chatwoot)
9. Better local models: "will it run on this Mac" from its RAM before a download; Jan and LM Studio
   servers on loopback as sources besides Ollama; what local runs saved, saying how it was estimated.
   (Jan, RuView)
10. Isolated commands, VM-backed: a project option to run Claude's commands in a light Linux VM through
    Apple's Virtualization.framework (via Apple's `container`, Lima or OrbStack): only the project folder
    mounted, network off by default, vault secrets only when allowed, the VM thrown away after; a proof
    check that `~/.ssh` cannot be read from inside. (Firecracker)
11. Savings that say how each number was estimated. (RuView)

Also queued and already in v1.2 above: import docs (Crawlee); the social pack (last 30 days brief, RSSHub
and feed discovery, any site as an app) is being built now.

## From the agent framework review of 2026-10-28

Ideas from Google ADK, VoltAgent, PraisonAI, AgentUse (Apache-2.0 / MIT) and Flameox (MIT), and the
architecture idea of a competitor's in-terminal CLI (Maestri; idea only, nothing copied). Features
as each project's own page describes them, not tested by us. In this order, after "stm inside each
panel" (in progress):

1. Loop detection: when a panel repeats the same tool call or error several times, pause it and say
   what it has spent on the repeat. (PraisonAI)
   Done (2026-10-28): app/shared/loopguard.ts. Same call 4 times within the last 6, A/B taking turns
   three rounds, or the same error 3 times in a row; the turn is interrupted like Stop and the panel
   shows the cost of the repeats with Continue / Continue and don't pause again / Show the repeats.
   On by default, thresholds in Settings > Appearance, logged to main.log, "paused: loop" in stm top.
   Local only: no new network calls.
2. Evidence on claims: when Claude says "fixed" or "faster", the panel shows whether a test or a
   measurement ran in that turn, marked observed, derived or inferred. The same marks on Savings and
   on the performance report. (Flameox) Started: after a turn whose reply claims a fix, a pass or a speed-up, the
   panel marks it observed (a test, build or measurement ran after the last edit), stale (files
   changed after it) or inferred (none ran). Savings and the performance report: not yet.
3. Model and effort evaluation: `stm eval` runs saved tasks from the project on several models and
   effort levels and shows cost, time and pass or fail, to find the cheapest setting that holds.
   (ADK, VoltAgent) Done: stm eval, plan first, runs with --yes under a spend cap.
4. Secret guard on what leaves: before a prompt is sent, warn when a vault secret or a pasted key is
   in it; the user decides. (VoltAgent) Done: the composer also checks saved vault values; messages
   that skip the composer (auto-send links, stm send --now) are refused when they carry one.
5. Permissions per trigger: each scheduled run lists the folders it may read or write and the
   commands it may run. (AgentUse) Done: limits on the trigger (may read, may write, may run); anything outside is
   refused before the usual approvals, each command in a chain checked.
6. Reviewer loop with a cap: a review panel sends work back to a build panel until tests pass, with a
   limit on rounds and on spend. Part of the canvas. (PraisonAI, ADK) Done: stm loop <build> <review>, until APPROVED,
   a round limit or a spend cap; drawing it on the canvas is still to come.
7. Approve with a comment or an edit: an approval can change the command or add an instruction that
   goes back to the agent. (AgentUse, ADK) Done: Edit and run on Bash cards (the edited command is
   checked and isolated like the original), and Deny with a note.
8. Learning from reviews: rejections and comments become a proposed change to CLAUDE.md, a persona or
   a trigger, applied only when the user accepts. (AgentUse) Started: notes sent with Deny with a note become
   proposed CLAUDE.local.md lines (stm learn, --pick applies). Personas and triggers: not yet.
9. Agents and teams as files: personas, triggers and saved teams stored as Markdown/YAML in the
   project, versioned with git. (AgentUse, ADK, PraisonAI) Done for personas and triggers: stm files
   export / import (plan first, --yes applies, imported triggers arrive off). Saved teams: not yet.
10. Recommended MCP servers: a short opt-in list, local only, starting with a profiler that reports
    evidence. Off by default; each host in docs/NETWORK.md. (Flameox)

Left out: hosted deployment, hosted observability consoles, inbound webhooks, chat-app connectors
and drag-and-drop builders. They need a server of ours or fall outside a local Mac app.

## Later

- New project from a template: persona, skills and CLAUDE.md set up in one step.

- A plugin store in the Catalog: anyone publishes personas, skills and integrations with their own page;
  after there are users.

- Codex (OpenAI) panels, once users ask for them.
- UI backlog leftovers (`docs/UI-BACKLOG.md`): empty sheets, copyable commands, left edges, one accent.
- Vault passwords URL-encoded in database connections; single-step guides without "0 of 1"; the
  Ollama next-step banner.
