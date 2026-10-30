# Spec: policy gate, audit log, visible plan, checkpoints

Status: spec only, no implementation. Branch `claude/control`. All paths below are under `app/` unless noted.

## Goal

1. One policy gate that every tool call of a panel passes, in front of the existing approval flow, with rules the person writes and an append-only audit log of every decision.
2. Routine caps on triggers and routines: minimum interval, maximum enabled, auto-disable after repeated failures.
3. The panel's TODO list (TodoWrite) shown as a live plan, on the panel and on the team canvas, with subagent and fan-out counts against their caps.
4. Checkpoints at each turn end ("restore to turn N") and breakpoints ("pause before tool X", "pause after the plan").

## Non-goals

- No network of any kind: no remote policy, no log shipping, no telemetry.
- No general expression language (no CEL, no scripting). The rule format is deliberately small.
- No change to what currently asks or is denied unless the person writes an explicit `allow` rule.
- No commits, branches or rewrites on the person's branches. Checkpoints use private refs only.
- No restore of state outside the worktree (databases, remote services, files outside the project).
- No multi-user or signed audit; the log is local and tamper-evident only by convention (append-only).

## Where it sits today

- `electron/session.ts:161` builds `canUseTool`; it calls `opts.decide(tool, input)` and then allows, denies or emits a `permission` card.
- `electron/main.ts:2112` provides `decide`: held MCP tools deny, `shared/mcppolicy.ts` verdicts, trigger scope (`shared/triggerscope.ts`) denies, then `decide(autonomy, ...)` with `shared/cmdrisk.ts`.
- `ui` and `stm` tools are MCP tools (`mcp__stm__*`, `electron/uitools.ts`) and so already pass `canUseTool`, with `stmLimits` (send per minute, spawn per hour) applied inside the tools.
- Triggers: `shared/triggers.ts` (`isDue`, `EVERY` already starts at 15 minutes), `shared/routines.ts`, `electron/main.ts:1260 fireTimed`, run history `settings.runs`.
- Resume: `session.ts:195-197` already passes `resume`, `resumeSessionAt` and `forkSession: true` to the SDK. Restoring a conversation to a turn is therefore possible.
- Redaction: `shared/secrets.ts` `redact(text, known)` and `findSecrets`.

## 1. Policy gate

### Rule format

A plain text file, one rule per line, `#` comments. Grammar:

```
rule    := effect SP tool [SP "when" SP cond ("and" cond)*] [SP "unless" SP cond ("and" cond)*] [SP "--" SP note]
effect  := "deny" | "ask" | "allow"
tool    := name | name-glob | "*"           # Bash, Edit, Write, Read, mcp__stm__*, network, write, read
cond    := field SP op SP value
field   := "cmd" | "path" | "branch" | "host" | "arg.<key>"
op      := "is" | "matches" | "has" | "inside" | "outside"
value   := quoted string | glob | "$project" | "$home"
```

Tool classes: `read` (Read, Grep, Glob, NotebookRead), `write` (Edit, MultiEdit, Write, NotebookEdit), `network` (WebFetch, WebSearch, and Bash whose command `cmdrisk` classifies as network: curl, wget, ssh, scp, git push/fetch/pull/clone, npm/pip install...). Fields are filled by a resolver per tool: `cmd` is the Bash command; `path` is the file argument or every path-looking token of a command, made absolute against the panel cwd; `branch` is the push target of `git push`; `host` is the URL host.

Examples:

```
# never delete recursively outside the project
deny Bash when cmd matches "rm -rf *" and path outside $project -- recursive delete outside project
# push only to claude/* branches
deny Bash when cmd matches "git push*" unless branch matches "claude/*"
# any network command asks
ask network
# reads in the project run without a card
allow read when path inside $project
```

### Files

- Global: `~/Library/Application Support/SuperTokenMan/policy/global.rules` (the app's userData dir).
- Per project: `<project>/.stm/policy.rules`. The project file is read from the project root, never from a worktree copy edited by the panel in the same turn (the gate reads it from the main checkout at session start and on file change; a panel editing it gets an `ask`).
- A file that fails to parse is reported in the UI with line numbers; its valid lines still apply, its invalid lines apply as `ask *` scoped to nothing (they are dropped), and a parse error never turns into an allow.

### Evaluation order

1. App hard denies stay first and are not policy: held MCP tools, trigger scope, aborted panel. The gate never runs past them.
2. Collect matching rules from global and project files.
3. Any matching `deny` wins (project and global equal). Decision `deny`, rule recorded.
4. Else any matching `ask`: decision `ask` (the permission card shows the rule note).
5. Else any matching `allow`: decision `allow`, but only if the existing `decide` result is `ask` or `allow`; never overrides a `deny` from `decide`.
6. No match: the existing `decide` result applies unchanged.

Combination with existing approval: `final = strictest(policy, existing)` where deny > ask > allow, with the single exception of an explicit `allow` rule turning an existing `ask` into `allow`. Breakpoints (section 3) are evaluated after the gate and can only turn allow into ask.

### Audit log

Layout: `<userData>/audit/YYYY-MM-DD.jsonl`, one JSON object per line, opened with append flag only. Rotation: a new file at local midnight; files older than a retention (default 90 days, setting) are deleted at startup. A file over 50 MB starts `YYYY-MM-DD.2.jsonl`.

Row schema (`AuditRow`, version 1):

| field | type | notes |
|---|---|---|
| v | 1 | schema version |
| at | number | epoch ms |
| panel | string | panel id |
| project | string | project name |
| turn | number | turn index in the session |
| tool | string | tool name |
| args | string | summary, max 300 chars, redacted with `redact()` plus the vault's known values, env-like `KEY=...` values and URL credentials masked |
| decision | 'allow' \| 'ask' \| 'deny' \| 'approved' \| 'refused' \| 'pause' | `approved`/`refused` are follow-up rows for an `ask` the person answered |
| by | 'rule' \| 'app' \| 'person' \| 'default' | who decided |
| rule | string? | `global:12` or `project:3` plus its note |
| costUsd | number? | turn cost on the turn-end row |
| kind | 'tool' \| 'receipt' \| 'checkpoint' \| 'cap' | |
| files | {path, change: 'A'\|'M'\|'D'}[]? | receipt rows only |

Delivery receipt: at each turn end the session diffs the worktree against the previous checkpoint (`git diff --name-status` between the two private refs) and writes one `receipt` row with the changed files and the turn cost.

## 2. Routine caps

Applied to triggers and routines (both use `shared/triggers.ts` `When`):

- Minimum interval 15 minutes: `cleanTrigger` and `checkRoutine` refuse an `every` below 15; a webhook trigger is limited to one fire per 15 minutes (fires inside are dropped and audited as `cap`).
- Maximum 20 enabled across triggers and routines together. Enabling the 21st is refused with a message; existing settings over the cap are kept but the oldest-armed beyond 20 are not fired until the person disables some (no silent disable).
- Auto-disable after 10 consecutive failed runs (failure = run ended with error, from `settings.runs`). The trigger gets `enabled: false`, `disabledReason: 'failures'`, a note and an audit `cap` row. A success resets the count.
- Caps are settings with these defaults; they can be lowered, not raised beyond a hard ceiling (interval >= 5 min, enabled <= 50, failures >= 3).

Pure decision: `capDecision(list, change, now) -> { ok } | { ok: false, reason }` and `afterRun(trigger, ok) -> trigger`.

## 3a. Visible plan

Data, extracted from TodoWrite tool_use inputs (the latest call replaces the plan):

```
Plan = { panel: string; sessionId: string; turn: number; at: number;
         items: { text: string; status: 'pending' | 'in_progress' | 'completed'; active?: string }[];
         agents: { used: number; cap: number }; fanout: { used: number; cap: number } }
```

`agents.used` counts Task/Agent tool calls in the current run (person's message to turn end); `fanout.used` counts panels started with `stm` spawn in the run. Caps: agents per run (default 8) and fan-out per run (default 5), settings; at the cap the gate returns `ask` for the next Task/spawn. The plan is saved with the session (`<userData>/sessions/<sessionId>.plan.json`) and restored when the panel resumes.

## 3b. Checkpoints

At each turn end (when the session reports `result`):

1. `git stash create` in the worktree (makes a commit object of the working tree and index without touching branches or the stash list; untracked files added via a temporary index: `GIT_INDEX_FILE=tmp git add -A && git write-tree && git commit-tree`).
2. Store it as `refs/stm/checkpoints/<panel>/<turn>`. No branch, no HEAD move.
3. Record `{ panel, sessionId, turn, ref, sha, head, messageUuid, at }` in `<userData>/checkpoints/<panel>.json` and an audit `checkpoint` row.

Restore to turn N: confirmation card listing the files that will change; then `git read-tree`/`checkout <sha> -- .` plus removal of files untracked since, leaving HEAD and branches as they are. Then the conversation: start the panel with `resume: sessionId, resumeSessionAt: messageUuid, forkSession: true` (already supported in `session.ts:197`), so the original session is kept and the panel continues from turn N.

Limits: no restore outside the worktree; not a non-git folder (panel shows "checkpoints need a git project"); ignored files (`.gitignore`) are not captured; if the HEAD commit moved since (the panel committed), files are restored but HEAD is not reset and the card says so; if the SDK reports the message is gone, files only are restored and the panel says "files restored, conversation started over". Refs are pruned to the last 50 per panel and on panel close after 7 days.

Breakpoints, per panel, kept in memory and in the panel's saved state:

- `before <tool-glob>`: the gate turns that tool's next call into `ask` with the label "Breakpoint"; the card has Approve and Deny (Deny ends with a message the model sees).
- `after plan`: after the first TodoWrite of a run, the session holds the next tool call as a breakpoint card showing the plan; Approve continues, Deny interrupts the turn.

## IPC

Add to `shared/ipccontract.ts`:

- `policy:read` [] -> { global, project } texts and parse errors
- `policy:write` [scope: 'global'|'project', cwd: string max 4096, text: string max 64000]
- `policy:test` [tool: string max 200, input: record] -> decision and rule (dry run)
- `audit:query` [{ from: number, to: number, panel?, tool?, decision?, text? max 200, limit <= 2000 }]
- `audit:days` []
- `plan:get` [sid]
- `checkpoint:list` [sid]
- `checkpoint:restore` [sid, turn: int >= 0]
- `breakpoint:set` [sid, list: { kind: 'before'|'afterPlan', tool?: string max 200 }[] max 20]
- `triggers:caps` [] / `triggers:setCaps` [{ minEvery, maxEnabled, maxFailures }]

Events to the renderer: `plan` and `checkpoint` session events on the existing panel channel.

## UI

All lazy-loaded (`React.lazy`), built from the app's own components (no native dialogs; `npm run no-native-ui` passes), no emoji, startup bundle stays under 215 KB gzip.

- Settings > Control: rules editor (two tabs, global and project) with parse errors inline and a "test a call" box.
- Audit view: day picker, filters (panel, tool, decision, text), virtualised table, receipt rows expandable to file lists.
- Panel: a plan strip under the header (items with status, `agents 3/8`, `fan-out 1/5`), a checkpoints menu ("Restore to turn N"), a breakpoint toggle menu.
- Team canvas: each panel node shows plan progress (done/total and the in-progress item).
- Triggers: caps line ("12 of 20 enabled") and the disabled-for-failures badge with Re-enable.

## Risks

- Path resolution in shell commands is heuristic; a rule may miss an obfuscated command. Mitigation: unresolvable `cmd` with a `path` condition counts as matching for `deny`/`ask` (fail closed) and never for `allow`.
- An `allow` rule written too broadly weakens approval; the editor warns on `allow *`, `allow Bash` without conditions and `allow write` outside `$project`.
- The panel editing `.stm/policy.rules`: handled by reading from the main checkout and asking on writes to it.
- Secrets in args beyond known patterns; redaction runs before any write and the log never stores full inputs.
- Audit write failure: decisions still apply; a failed write shows a note and is retried once; it never turns into allow.
- Checkpoint cost on huge worktrees: skipped above 20k changed files with a note.
- Gate latency: rules are compiled once per file change; evaluation must stay under 1 ms per call.

## Tasks

Wave 1: pure `app/shared` with vitest (no electron, no fs except where noted).

| id | files | must not touch | done when |
|---|---|---|---|
| W1.1 rules parser | `shared/policyrules.ts`, `.test.ts` | electron/, src/ | parses grammar, line-numbered errors, examples above round-trip |
| W1.2 evaluator | `shared/policygate.ts`, `.test.ts` | `shared/cmdrisk.ts` (import only), electron/ | deny before ask before allow; `strictest()` never loosens without explicit allow; fail-closed cases tested |
| W1.3 redaction of args | `shared/auditredact.ts`, `.test.ts` | `shared/secrets.ts` (import only) | env values, URL creds, tokens, vault values masked; 300-char cap |
| W1.4 audit row and rotation | `shared/auditlog.ts`, `.test.ts` | electron/ | `buildRow`, `fileFor(date, size)`, `expired(files, now, days)` tested |
| W1.5 routine caps | `shared/routinecaps.ts`, `.test.ts` | `shared/triggers.ts`, `shared/routines.ts` | `capDecision`, `afterRun` tested for 15 min, 20 enabled, 10 failures |
| W1.6 plan extraction | `shared/planview.ts`, `.test.ts` | src/ | TodoWrite inputs and Task/spawn counts give `Plan`; malformed input ignored |
| W1.7 checkpoint plan | `shared/checkpoint.ts`, `.test.ts` | electron/ | returns the git argv sequence for create and restore, ref names, prune list; no branch-touching command in output (tested) |

Wave 2: wiring (depends on wave 1).

| id | files | must not touch | done when |
|---|---|---|---|
| W2.1 gate in decide | `electron/main.ts` (decide), `electron/policy.ts` (new: load, watch files) | `electron/session.ts` canUseTool order | existing tests pass; gate after hard denies; session test shows ask not loosened |
| W2.2 audit writer | `electron/audit.ts` (new), `electron/session.ts` (turn-end hook) | src/ | every decision and answered card writes a row; receipt row per turn |
| W2.3 caps in triggers | `shared/triggers.ts` `cleanTrigger`, `shared/routines.ts` `checkRoutine`, `electron/main.ts` fire/runs | `shared/webhook.ts` | tests for refusal and auto-disable |
| W2.4 plan and run caps | `electron/session.ts` (emit `plan`), `electron/uitools.ts` (fan-out count) | `stmLimits` defaults | plan event emitted and saved; cap gives ask |
| W2.5 checkpoints and breakpoints | `electron/checkpoints.ts` (new), `electron/session.ts` | user branches, `.git/refs/heads` | create/restore tested on a temp repo; resume fork used |
| W2.6 IPC | `shared/ipccontract.ts`, `.test.ts`, `electron/preload.ts`, `electron/main.ts` | other channels | contract test covers new channels |

Wave 3: UI and docs.

| id | files | must not touch | done when |
|---|---|---|---|
| W3.1 Control settings and audit view | `src/Control.tsx`, `src/AuditLog.tsx` (lazy) | startup chunks | no-native-ui passes; perf budget 215 KB holds |
| W3.2 plan strip, canvas badge | `src/PlanStrip.tsx` (lazy), `src/Panel.tsx`, canvas node file | `shared/canvas.ts` logic | live updates in panel and canvas |
| W3.3 checkpoint and breakpoint menus | `src/Checkpoints.tsx` (lazy), `src/Panel.tsx` | approval card behaviour | restore confirm card; breakpoint card |
| W3.4 trigger caps UI | Triggers view | | caps line and re-enable |
| W3.5 docs | `docs/STM_GUIDE.md`, `docs/ROADMAP.md` | | rule format and examples documented |

## Open questions

1. Should project rules be able to `allow` what a global rule asks? Recommendation: no; deny and ask are union across scopes, allow from a project applies only where no global ask/deny matches.
2. Should the audit log hash-chain rows for tamper evidence? Recommendation: later; append-only plus daily files is enough for a local app.
3. Untracked ignored files in checkpoints? Recommendation: exclude; say so in the restore card.
4. Breakpoints for scheduled (unattended) runs? Recommendation: a breakpoint on an unattended run denies and records a note instead of waiting forever.
5. Audit retention default? Recommendation: 90 days, setting from 7 to 365.
6. Per-run agent cap default? Recommendation: 8 agents, 5 fan-out panels, ask (not deny) at the cap.
