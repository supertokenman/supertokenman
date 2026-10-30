# Spec: background panels, precise state and wait, SSH machines

Status: spec only. Branch `claude/runtime`. Ideas only from a public Apache-2.0 terminal runtime for coding agents (its README): a background server, detach/reattach, layout restore after restart (a restore, not a continuation), working/blocked/idle labels, a socket API that waits until another agent is blocked, and saved SSH hosts in one list with independent reconnect. No code, names or wording are taken. If any snippet is ever reused, its Apache-2.0 NOTICE must be kept in `THIRD_PARTY_NOTICES` and the file header. That project's name is not used in the product.

## What exists (checked)

- `app/electron/session.ts`: `Session` wraps one long-lived SDK `query` fed by an `Inbox` prompt queue; `canUseTool` (line ~161) routes approvals through `decide`; `spawn` (line ~192) already starts Claude Code on another machine through ssh.
- `app/electron/main.ts`: `before-quit` (line ~5001) notes where each panel stopped (`noteStopped`), then closes every session, shell and helper. `window-all-closed` closes sessions and quits. On macOS the red button only hides the window; Cmd+Q ends everything. Idle panels already sleep and resume on the next message (line ~4904). `session:new` (line ~1946) takes `resume`, `resumeAt`, `remote`.
- `app/src/App.tsx`: "Reopen N panels from last time" (line ~1533) calls `reopen()` (line ~946), which resumes each panel by `sessionId`, in its sandbox or on its remote host; unreachable ones are skipped.
- Status today is a boolean `busy` (`App.tsx` line ~700); "Needs you" lives in `src/Inbox.tsx` and `src/Today.tsx`.
- `app/shared/remote.ts`: `shq`, `remoteEnv` (no credentials sent), `sshArgs`, remote dir checks; `electron/targets.ts` `sshTargets` reads hosts.
- `app/electron/cliserver.ts`: the stm CLI over a Unix socket with a 600 token file; `electron/hub.ts` wait graph refuses cycles; `electron/uitools.ts` stm MCP tools; `shared/ipccontract.ts` lists IPC channels.
- `spec-qfc.md` on `claude/queue-failover-channel`: per-panel queue, failover with notice, team channel; it already relies on `hub.ts` and approvals.

## Goal

1. Optional "Keep panels running": panels keep working after Cmd+Q / window close, visibly, and reattach with scrollback and state.
2. Precise panel state (working, waiting_approval, waiting_input, idle, error) and `stm wait` so one panel can act when another blocks.
3. Saved SSH hosts: panels whose Claude Code runs on a named host, in the same list, with independent reconnect.

## Non-goals

- No auto-run after a reboot, no silent resume, no spending outside existing approvals, budgets, `stmLimits` and link caps.
- No TCP listener, no remote access to the host process, no keys or passwords stored (ssh config and agent only).
- No process survival across reboot (restore is layout plus an offer to resume).
- v1: one SSH host connected at a time; no port forwarding UI, no jump-host editor (ssh config handles it).
- No Windows/Linux background host in v1.

## Feature 1: Keep panels running

### Options

(a) Electron main stays alive with no window, as a menu bar `Tray`.
- Signing/notarization: nothing new; same bundle, same entitlements.
- Updater: electron-updater already owns this process; `quitAndInstall` works unchanged, the update gate (`electron/updategate.ts`) asks first when panels run.
- Memory: ~120-200 MB for a windowless Electron main, plus each Claude Code child (the bulk either way).
- Crash recovery: a crash of main kills all panels (same as today). Mitigated by resume-on-relaunch.
- Socket security: unchanged; reuses `cliserver.ts` (Unix socket, 600 token).
- Code: small. Sessions, tracking, budgets, approvals all stay in one process.

(b) Separate node helper under launchd (LaunchAgent), app as client over a local socket.
- Signing: a second signed executable (or `ELECTRON_RUN_AS_NODE` of the app binary) plus a LaunchAgent plist, `SMAppService` registration, login-item prompts; notarization of a helper; harder.
- Updater: the helper holds the old app bundle's files open; electron-updater replaces the bundle, then must stop and restart the helper via `launchctl kickstart -k`; version skew between client and helper needs a protocol version.
- Memory: lower idle (~40-60 MB) without a window, but two processes when the window is open.
- Crash recovery: the app UI can crash without killing panels; launchd restarts the helper (but restarted helper loses live processes anyway).
- Socket: new protocol carrying every session event, approvals and budgets; a much larger attack and bug surface. Moving `track()`, budgets, approvals, MCP bridges and `decide` out of `main.ts` (7.7k lines) is a large refactor.

### Recommendation: (a)

Option (a) gets the user-visible value (panels survive closing and quitting the window) with no new signed binary, no updater dance and no refactor of approvals and budgets. Its one weakness, a main-process crash, already exists today and is covered by restore. Keep the lifecycle reducer and the session event log process-agnostic so (b) stays possible later.

### Behaviour

- Setting `keepRunning` (off by default) in Settings > General, with text "Panels keep running and spending after you close SuperTokenMan."
- With it on and at least one panel working or queued: Cmd+Q and window close hide windows, `app.dock.hide()`, and show the Tray. With zero live panels, quit quits.
- Tray (always shown while background): title `3 running  $1.42 today` (text only, no emoji); menu: per-panel line with state, Open SuperTokenMan, Stop all (confirm), Quit and stop all.
- Budgets, limits, approvals, sleep of idle panels unchanged. An approval request in background raises a macOS notification and marks the Tray `needs you`; nothing is auto-allowed.
- Reattach: opening the app (dock, Tray, `stm open`) creates the window; renderer asks `runtime:snapshot` and gets each panel's state plus its buffered event log (ring buffer, last 2 000 events or 4 MB per panel, kept in main), then replays it into the transcript. Scrollback is the replayed log.
- Real quit ("Quit and stop all", update install, logout): existing `before-quit` path (`noteStopped`, close all).
- Reboot / crash: on next launch the saved layout (`panels` record with `sessionId`, cwd, remote host) is restored as closed panels with a banner "N panels were running. Resume?"; Resume uses the existing `reopen()`; nothing runs until the user clicks.
- Login item: not changed by this feature.

### Lifecycle (ASCII)

```
LAUNCH
 app start -> read layout -> live sessions in main? (only after reattach, same process)
   | none                       | some (window re-created)
   v                            v
 restore layout as closed   runtime:snapshot -> replay logs -> attached
 + "Resume N?" banner (if crash/reboot marker)

CLOSE WINDOW / Cmd+Q (keepRunning on, live>0)
 before-quit -> preventDefault -> hide windows -> dock.hide -> Tray on
   -> state = background ; sessions untouched ; budgets keep running

CLOSE / QUIT (keepRunning off, or live==0, or "Quit and stop all")
 before-quit -> noteStopped(all) -> close sessions/shells -> write clean-exit marker -> exit

REBOOT / CRASH
 processes gone -> no clean-exit marker
 next launch -> layout restored -> banner "N panels were running. Resume?" -> user clicks -> reopen()

UPDATE
 update ready -> live>0 ? updategate asks "Restart now stops N panels" : install
   -> user accepts -> noteStopped(all) -> quitAndInstall -> relaunch -> restore + Resume offer
   -> user declines -> install on next real quit
```

## Feature 2: precise state and `stm wait`

### States

`working | waiting_approval | waiting_input | idle | error`, plus `closed` for the lifecycle.

Classifier `classify(prev, ev)` over UI events (`UiEvent` in session.ts) and the approval queue:
- user prompt pushed, `assistant` / tool_use / tool_result / stream delta -> `working`
- `canUseTool` pending or `stm ask` pending (approval queue non-empty for the panel) -> `waiting_approval` (wins over working)
- `result` success with an `AskUserQuestion`-style tool or the last assistant text ending in a question to the user, or a plan awaiting approval -> `waiting_input`
- `result` success otherwise, or sleep -> `idle`
- `result` with `is_error`, quota held (`QUOTA_HELD`), process exit non-zero, ssh disconnect -> `error` (with `reason`)
- approval answered -> back to `working`
"blocked" = `waiting_approval | waiting_input | error`. "done" = `idle` after at least one turn since the wait began (or `closed`).

The status dot, "Needs you" list (`Inbox.tsx`, `Today.tsx`) and the Tray count read this one value instead of `busy`.

### State machine

```
            prompt
  idle ---------------> working <-------------+
   ^  ^                 |   |  ^              | approved/denied
   |  | result ok       |   |  +---------+    |
   |  +-----------------+   | tool asks   |    |
   |                      v             |    |
   |               waiting_approval ----+----+
   |  result asks user
   +-- waiting_input <---- working
   any --(error/exit/disconnect/quota)--> error --prompt/resume--> working
   any --close--> closed
```

### Wait conditions

`waitDone(cond, state, sinceTurn)` pure; `blocked` true at once if already blocked; `idle` true at once if idle; `done` requires a turn ended after the wait started. Timeout default 10 min, max 24 h. Waits go through `hub.ts` so A waits B waits A is refused.

### Surface

CLI (`cliserver.ts` handler `wait`):
```
stm wait --for blocked|idle|done <panel> [--timeout 10m]
  exit 0 condition met (prints state JSON), 2 timeout, 3 panel closed, 4 cycle refused, 1 error
stm state [<panel>]          # prints {panel, state, reason?, since}
```
`<panel>` = panel id, name or team member name (team resolution from spec-qfc team channel when merged; until then id/name).

MCP (stm server, `uitools.ts` sibling): `panel_state({panel})`, `panel_wait({panel, for, timeoutSec})` returns `{met, state, reason}`. A wait never sends anything; acting after it (e.g. posting to the team channel or answering) uses existing tools and their approvals. With spec-qfc: a team-channel post may carry `after: {panel, for}` that holds delivery until the condition is met (queued item, not auto-sent beyond the link's `auto`).

IPC (add to `shared/ipccontract.ts`): `panel:state` (main->renderer event `{sid, state, reason, since}`), `panel:states` (invoke, all), `runtime:snapshot` (invoke), `runtime:keepRunning` (get/set), `runtime:stopAll` (invoke), `hosts:list`, `hosts:save`, `hosts:remove`, `hosts:test`, `hosts:status` (event).

## Feature 3: SSH machines

Remote panels exist (`shared/remote.ts`, `session:new` `remote`). v1 adds saved, named hosts and independent reconnect.

- Host record: `{ id, name, sshAlias, defaultDir, claudePath? }`. `sshAlias` must be a Host entry from `~/.ssh/config` or `user@host`; validated (no spaces, no leading `-`, no shell metacharacters, length <= 255). No keys, passwords or agent sockets stored. Settings > Machines lists them.
- Transport: `ssh -T -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 <alias> -- <claude ...>` via the existing `spawn` hook; stdin/stdout carry the SDK stream. The stm bridge: a `ssh -R <remote-unix-socket>:<local cli socket>` forward (`StreamLocalBindUnlink=yes`, remote socket in `~/.supertokenman/run/<rand>.sock` created 600 under a 700 dir) so the remote `stm`/MCP reaches the local `cliserver` with a per-panel scoped token passed in env (`remoteEnv` allow-list extended for `STM_SOCKET`, `STM_TOKEN` scoped to that panel's tools only).
- Network: nothing contacts any host until the user adds one and opens a panel on it.
- Reconnect: each remote panel has its own connection state `connected | reconnecting(n) | offline`. On drop, backoff 1s, 2s, 4s ... capped 60s with +-20% jitter, max 10 tries, then `offline` with a Retry button. Reconnect resumes by `sessionId` (conversation lives on the remote); it never re-sends the last prompt. While reconnecting, state is `error` reason `disconnected`; budgets keep counting what was reported.
- v1 limit: one host connected at a time; opening a panel on a second host asks to disconnect the first.
- `docs/NETWORK.md`: new section "Hosts you add": only the hosts the user saves, over the user's own ssh, only when a panel opens on them.

## Security

- No new listener: background mode reuses the 600 Unix socket and token; the remote forward is a Unix socket on the remote under a 700 dir, never TCP (`-R` with a path, not a port).
- Remote token scoped per panel (state, wait, ask, ui tools of that panel); revoked on panel close.
- ssh args built with `shq`/arg arrays only, `--` before the remote command, alias validated; `BatchMode=yes` so no password prompt is captured.
- Background visibility: Tray always shown while any panel lives without a window; cost from the existing usage tracking.
- Approvals while hidden: only notification + Tray; never auto-allowed, never timed-out into allow.
- Event log ring buffers stay in memory (not written to disk beyond what transcripts already store).

## Risks

- Users forget background spending: mitigated by Tray cost, off by default, daily notification "N panels ran in the background today, $X".
- Main-process memory growth over days: ring-buffer caps, idle sleep stays on.
- Classifier misreads `waiting_input` from free text: prefer structured signals; text heuristic only as fallback, fixture tests.
- Updater with live panels: gate asks; worst case update waits for a real quit.
- ssh remote socket forward needs OpenSSH >= 6.7 on both ends and `AllowStreamLocalForwarding` on the server: fall back to running without stm tools and say so.
- `dock.hide()` and window re-creation edge cases with `activate`.

## Tasks

Wave 1: pure `app/shared` logic with vitest (new files; checked `ls app/shared`, no clashes).

| # | Task | Files | Must not touch | Done when |
|---|------|-------|----------------|-----------|
| 1.1 | Panel state classifier | `shared/panelstate.ts`, `shared/panelstate.test.ts`, `shared/__fixtures__/panelstate/*.json` | `electron/`, `src/` | fixtures (turn, approval, ask, question, error, quota, disconnect) classify correctly |
| 1.2 | Wait conditions | `shared/waitfor.ts`, `.test.ts` | `electron/hub.ts` | blocked/idle/done, since-turn, timeout parse (`10m`, `90s`, cap 24h) tested |
| 1.3 | Lifecycle reducer | `shared/lifecycle.ts`, `.test.ts` | `electron/main.ts` | launch/close/quit/crash/reboot/update transitions and "should quit / go background / offer resume" tested |
| 1.4 | SSH host config validation | `shared/sshhost.ts`, `.test.ts` | `shared/remote.ts` | rejects `-oProxyCommand`, spaces, metachars; accepts aliases, `user@host`, ports via config |
| 1.5 | Reconnect backoff | `shared/backoff.ts`, `.test.ts` | anything else | sequence, cap, jitter bounds (seeded), max tries |
| 1.6 | Event ring buffer | `shared/eventring.ts`, `.test.ts` | anything else | count and byte caps, replay order |

Wave 2: host process and wiring.

| # | Task | Files | Must not touch | Done when |
|---|------|-------|----------------|-----------|
| 2.1 | keepRunning lifecycle in main | `electron/main.ts` (before-quit, window-all-closed, activate), `electron/tray.ts` | `electron/session.ts` | manual test: Cmd+Q with live panel keeps it, Tray shows count/cost, Stop all ends all |
| 2.2 | State + ring buffer per panel, `panel:state`, `runtime:snapshot` | `electron/main.ts`, `shared/ipccontract.ts`, `src/bridge.ts` | `src/App.tsx` UI | contract test passes; snapshot returns log |
| 2.3 | `stm wait` / `stm state` CLI and MCP | `electron/cliserver.ts` handlers in main, `electron/uitools.ts` or new `electron/waittools.ts`, `electron/hub.ts` (wait edge) | `shared/teambus.ts` | exit codes per spec; cycle refused |
| 2.4 | Crash/reboot marker and resume offer data | `electron/main.ts` | `src/` | unclean exit sets `resumeOffer` |
| 2.5 | Update gate with live panels | `electron/updategate.ts`, `.test.ts` | updater config | asks before restart when live>0 |
| 2.6 | Saved hosts + bridge forward + reconnect | `electron/hosts.ts`, `electron/targets.ts`, `shared/remote.ts` (env allow-list only) | `electron/session.ts` beyond `spawn` | panel on saved host reconnects after `kill` of ssh, stm works remotely |

Wave 3: UI and docs (lazy, within 215 KB startup budget, app components only, no emoji, `no-native-ui` passes).

| # | Task | Files | Must not touch | Done when |
|---|------|-------|----------------|-----------|
| 3.1 | State dot and "Needs you" from new state | `src/App.tsx`, `src/Inbox.tsx`, `src/Today.tsx` | `electron/` | five states visible; tests pass |
| 3.2 | Reattach replay + resume banner | `src/App.tsx` (reuse `reopen()`) | `electron/` | reopen window shows prior scrollback |
| 3.3 | Settings: Keep panels running, Machines (lazy chunk) | `src/settings/Runtime.tsx`, `src/settings/Machines.tsx` | startup bundle | budget check passes; no-native-ui passes |
| 3.4 | Docs | `docs/NETWORK.md` ("Hosts you add"), `docs/STM_GUIDE.md` (`stm wait`, `stm state`), `docs/ROADMAP.md` | code | docs merged |

## Open questions

1. Cmd+Q in keepRunning mode: hide or ask once? Recommend: first time ask with "Keep running / Quit and stop", remember choice; Tray always offers real quit.
2. Should approvals be answerable from the Tray menu? Recommend: no in v1, open the window (full context before spending).
3. Ring buffer on disk for crash replay? Recommend: no; transcripts already persist, resume is enough.
4. `waiting_input` from free text? Recommend: structured signals only by default; text heuristic behind a flag.
5. Move to a launchd helper (option b) later? Recommend: only if crash rate of main with windowless runtime proves material; keep reducers process-agnostic.
6. More than one SSH host at a time? Recommend: v2, after reconnect is proven.
7. Daily background-cost notification on by default when keepRunning is on? Recommend: yes.
