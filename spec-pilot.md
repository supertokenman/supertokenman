# Spec: Pilot, the panel agent drives the app

Status: spec only, no implementation. Branch `claude/pilot`. All paths below are under `app/` unless noted.

## Goal

1. The Claude agent in a panel can do, end to end, what the person can do with mouse and keyboard: open screens, arrange panels, change settings, run routines, install packs.
2. Every command-palette (Cmd+K) command becomes an agent tool automatically, from one typed catalog, so a new command is a new tool with no extra work.
3. Read tools that let the agent see the app: what is open, panel states, non-secret settings, today's cost, routines and triggers, packs, layout, notifications.
4. Permission tiers (free, ask, always-confirm) enforced in main, through the Control policy gate and audit log (`spec-control.md`).
5. An "agent actions" list per window, with undo for reversible actions.
6. A Pilot panel reachable from anywhere by shortcut, whose session has the full catalog, on a cheap model by default for pure UI requests.

## Non-goals

- No screen reading, pixel clicking or synthetic DOM events. The agent acts through the catalog only.
- No vault values, tokens or secret settings in any tool result, ever.
- No new network access. Pilot runs on the existing session path; nothing new leaves the machine.
- No agent path to raise its own tier or edit policy files (already a rule in `spec-control.md`).
- No cross-window or remote driving. One window, one actions list.
- No undo of irreversible effects (money spent, messages sent, files deleted, posts published).

## Where it sits today

- `electron/uitools.ts:10` `UI_TOOLS`: `ui_set_layout`, `ui_open_panels`, `ui_link_panels`, `ui_arrange`, `ui_list_panels`, `delegate`, `collect`, `channel_post`, `channel_read`, `channel_mentions`, as `mcp__stm__*`; `uiTools(d: UiDeps)` at line 63 builds them.
- `electron/hub.ts:11` panel tools `mcp__panels__list_panels`, `message_panel`, `panel_state`, `panel_wait`.
- `electron/guide.ts`: `APP_GUIDE` text, `MANUAL_TOOL = 'mcp__stm__manual'`, `manualServer(ui?: UiDeps)`; `shared/manual.ts` is the manual source, written to `docs/STM_GUIDE.md` by `npm run guide`.
- The palette is not a registry: `src/App.tsx:1256` `paletteEntries(): Entry[]` builds an inline list of `{ id, group, label, hint, keywords, run }` with `run` as React closures (`setTodayOpen(true)`, `setLayout(l.id)`, `dispatch({ kind: 'focus', sid })`, ...). Rendered by `src/Palette.tsx` (`App.tsx:1642`). The application menu reuses it by id (`App.tsx:1176-1186`, `go-<layout>` at 1211). Palette IPC: `electron/preload.cjs:61` (`palette:summon`, `palette:used`, `palette:dismissed`).
- Control: `electron/policy.ts` (`PolicyStore`, `PanelControl`, `gate(tool, input, existing, o)`), `shared/policygate.ts` (`Decision = 'allow' | 'ask' | 'deny'`), `shared/policyrules.ts`, `electron/audit.ts` (`AuditLog`), `shared/cmdrisk.ts`.
- IPC contract: `shared/ipccontract.ts` with `ipccontract.test.ts`; preload is `electron/preload.cjs`.
- UI kit: `src/ui/` (`dialog.tsx`, `controls.tsx`, `Select.tsx`, `ContextMenu.tsx`, `Tooltip.ts`); guard `scripts/no-native-ui.mjs`; startup budget `scripts/startup-size.mjs` (215 KB JS).
- Docs: `docs/BRAND.md`, `docs/NETWORK.md`, `docs/ROADMAP.md`, `docs/STM_GUIDE.md`.

## 1. Command catalog

The palette's ids, labels and closures stay in the renderer; what the agent needs (id, args, tier) must be known in main, which enforces tiers. So the catalog is split:

- `shared/pilotcatalog.ts` declares a static `CommandSpec` per command id. Types:

```ts
type Tier = 'free' | 'ask' | 'confirm'          // confirm = always-confirm
type ArgSchema = { [name: string]: { type: 'string' | 'number' | 'boolean' | 'enum'; values?: string[]; optional?: boolean; max?: number; describe: string } }
type CommandSpec = {
  id: string                 // palette id, e.g. 'today', 'layout-2x2', 'worktree'
  title: string
  group: string
  args: ArgSchema            // {} for plain commands
  tier: Tier
  agent: boolean             // false: needs a picker, file dialog or typing the person must do
  undo?: 'layout' | 'panels' | 'setting' | 'routine' | 'none'
  effect?: 'irreversible'    // said in the confirm card and in the tool result
}
```

- Dynamic families (`layout-<id>` from `LAYOUTS`, `panel-<sid>`) are one spec with an arg (`layout { id: enum }`, `focus { sid }`), matched by prefix.
- `src/pilotRun.ts` (new) maps id to a runner `(args) => Promise<Result>`. `App.tsx` passes the same closures it gives the palette; `paletteEntries` gains the spec id where it differs. A unit test (`src/pilotRun.test.ts`) fails when a palette id has no `CommandSpec` and no `agent: false` mark, so a new command is either a tool or explicitly not one; this is the "no extra work" contract (the author adds one line of spec, the test tells them).
- Main never runs renderer code itself: a tool call goes main -> renderer over `pilot:run` with `{ id, args, callId }` and the renderer answers `pilot:result`. Timeout 10 s, then an error result.
- Commands that need UI input (worktree folder picker, file chooser, pasting a secret) are `agent: false` or get an args schema replacing the picker (for example `worktree { repo, branch }`). Which of the ~50 current entries fall in each bucket: verify during W1.1 by walking `paletteEntries`.

## 2. Tools

Three generic tools instead of one schema per command, so context does not grow with the catalog:

- `mcp__stm__app_commands({ group? })`: the summarized catalog (id, title, tier, one-line args) from `summarize()`.
- `mcp__stm__app_describe({ id })`: full args schema, tier, undo kind, irreversible note.
- `mcp__stm__app_run({ id, args })`: validates args (`validateArgs`), resolves tier, passes the gate, runs, records the action.

Read tools (tier free, no vault access possible because they read from typed projections, not raw settings):

- `app_state()`: open screens and sheets, focused panel, layout, panel list with states (reuses `hub.ts` `panel_state`).
- `app_settings({ keys? })`: settings through an allowlist projection `publicSettings()` in `shared/pilotread.ts`; keys marked secret or vault-backed are dropped, not masked.
- `app_cost()`: today's cost and per-panel cost (source: `electron/billing.ts`; verify the exact function).
- `app_routines()`: routines and triggers with enabled state, next run, last result (`shared/routines.ts`, `shared/triggers.ts`).
- `app_packs()`: installed and available packs (`spec-packs.md`; verify module name).
- `app_notifications({ limit })`: recent notifications (verify where they are stored).

Existing `UI_TOOLS` stay; `ui_set_layout` etc. become tier free with undo recorded.

## 3. Permission tiers

`shared/pilottier.ts` `resolveTier(spec, ctx): Tier` and `toDecision(tier, ctx): Decision`.

| Tier | What | Decision |
|---|---|---|
| free | reads; view, layout, focus, theme, open/close a screen or panel view | allow |
| ask | opens sessions, spends money, delegates, creates or edits routines and triggers, installs packs | ask (card) unless a policy `allow` rule matches and the turn is clean |
| confirm | destructive (delete, kill process, close with unsaved work), network-enabling, vault, settings that widen permissions (autonomy, policy, MCP enable) | always ask; no rule can make it allow |

Rules:

- Tier is computed in main from the `CommandSpec` and args, never from anything the agent sends. Setting changes are classified per key: `shared/pilottier.ts` holds `WIDENING_KEYS` (verify the full list against settings in `electron/main.ts`).
- The gate call is `gate('mcp__stm__app_run', { id, args }, existing, o)` in `electron/policy.ts`, with `existing.action` from `toDecision`. Policy rules can name `app_run:<id>`; `strictest()` semantics from `spec-control.md` apply, so a rule can tighten anything and loosen only ask-tier.
- Taint: the session marks a turn tainted once it has read untrusted content (Read/Grep/WebFetch results from the repo or the web, MCP tool results not from `stm`, channel messages from other panels). In a tainted turn, ask-tier never resolves to allow, even with a matching `allow` rule. Tracked in `electron/session.ts` per turn; pure rule `taintedAfter(toolName)` in `shared/pilottier.ts`.
- Policy files and tier tables are not reachable through `app_run` (no spec for them; `validateArgs` rejects ids not in the catalog).
- Every call writes an audit row (`electron/audit.ts`) with `by: 'pilot'`, id, redacted args (`shared/auditredact.ts`), tier, decision, tainted flag.

## 4. Undo and the actions list

`shared/pilotundo.ts`: an `UndoStack` per window, capped at 100 entries.

- Each successful `app_run` pushes `{ at, panel, id, args, title, undo: Inverse | null }`. `Inverse` is data, not a closure: `{ kind: 'layout', prev }`, `{ kind: 'panels', closed?, opened? }`, `{ kind: 'setting', key, prev }`, `{ kind: 'routine', id, prevEnabled }`.
- Undo runs the inverse through the same `app_run` path as tier free when the inverse only restores a previous value, and as the original tier otherwise (re-enabling a routine is ask).
- Irreversible commands (`effect: 'irreversible'`) are listed with "cannot be undone"; the confirm card says so before running, and the tool result tells the agent.
- Undo is offered only if state was not changed since by the person (compare current value with the recorded new value; on mismatch the entry shows "changed since").

## 5. Pilot panel

- A pinned sheet, `src/Pilot.tsx` (lazy), opened by a shortcut (proposal `Mod+J`; verify it is free in `electron/main.ts` menu and `App.tsx` key handling) and by a palette entry `pilot`.
- Its session gets the full set: `app_commands`, `app_describe`, `app_run`, the read tools, `UI_TOOLS`. Other panels get the read tools, `app_commands`, `app_describe`, and `app_run` limited to free-tier ids by default (setting `pilotEverywhere`, default off).
- Model: a setting `pilotModel`, default the cheapest model the person has configured (verify how models are listed in settings); the Pilot session switches to the person's normal model if they ask for code work (the guide says to `delegate` instead).
- The actions list lives at the bottom of the Pilot sheet, with an undo button per row and "undo last" bound to `Mod+Shift+Z` inside the sheet only.

## 6. Cost, latency, rate limit, guide

- Cost: three generic tools cost a few hundred tokens of schema; the summarized catalog is fetched on demand (`app_commands`), about 1-2 K tokens for ~50 commands (verify after W1.5). Per-command schemas come only through `app_describe`.
- Latency: `app_run` is one IPC round trip to the renderer plus the gate; target under 100 ms for free-tier commands, excluding the model turn.
- Rate limit: `shared/pilotrate.ts` token bucket per panel: 30 actions per minute, burst 10; ask and confirm tiers count double. Over the limit the tool returns an error text, not a card. Limits sit next to `stmLimits` (verify location) and are not agent-editable.
- Guide: `electron/guide.ts` `APP_GUIDE` gains three lines (the three tools, "describe before run", "never ask for secrets"); `shared/manual.ts` gains a `pilot` section with tiers and undo; the catalog itself is never pasted into the prompt.

## IPC

| Channel | Direction | Payload |
|---|---|---|
| `pilot:run` | main -> renderer | `{ callId, id, args }` |
| `pilot:result` | renderer -> main | `{ callId, ok, text, undo? }` |
| `pilot:actions` | renderer -> main (invoke) | `{ window }` -> `Action[]` |
| `pilot:undo` | renderer -> main (invoke) | `{ actionId }` -> `{ ok, reason? }` |
| `pilot:changed` | main -> renderer | actions list changed |
| `pilot:summon` | main -> renderer | open the Pilot sheet (menu accelerator) |

All added to `shared/ipccontract.ts` and `electron/preload.cjs` under `window.stm.pilot`.

## UI

- `src/Pilot.tsx` (lazy chunk): sheet with the Pilot session, the actions list, a tier legend. Built from `src/ui` (`dialog.tsx`, `controls.tsx`, `ContextMenu.tsx`), no native controls (`scripts/no-native-ui.mjs`), look per `docs/BRAND.md`.
- Confirm cards reuse the existing permission card, with the command title, args, tier and "cannot be undone" when irreversible.
- A small "agent did this" marker on screens opened by the agent, cleared on the next person action (optional, verify it fits BRAND.md).

## Risks

- Prompt injection from repo or web content driving the app. Mitigation: taint rule, confirm tier, rate limit, audit, undo.
- Catalog drift: a palette command without a spec. Mitigation: `src/pilotRun.test.ts` fails.
- Renderer closures with hidden side effects (an "open" that also starts a fetch). Mitigation: tier by real effect, reviewed per spec line.
- Settings leakage through `app_settings`. Mitigation: allowlist, not denylist; test that every vault-backed key is absent.
- Undo surprise after the person changed state. Mitigation: "changed since" check.
- Startup size: everything new lazy except a ~1 KB shortcut hook.

## Tasks

Wave 1: pure `app/shared` with vitest.

| # | Task | Files | Must not touch | Done when |
|---|---|---|---|---|
| W1.1 | Catalog types and validation | `shared/pilotcatalog.ts`, `.test.ts` | `src/`, `electron/` | `CommandSpec`, `ArgSchema`, prefix families, `validateArgs` (types, enums, max, unknown keys rejected) tested; initial specs for every current palette id |
| W1.2 | Tier resolution and taint | `shared/pilottier.ts`, `.test.ts` | `shared/policygate.ts` (import only) | `resolveTier`, `toDecision`, `WIDENING_KEYS`, `taintedAfter` tested; confirm never allow; tainted ask never allow |
| W1.3 | Undo stack | `shared/pilotundo.ts`, `.test.ts` | `electron/` | push, cap 100, inverse per kind, "changed since" check, irreversible entries tested |
| W1.4 | Rate limiter | `shared/pilotrate.ts`, `.test.ts` | `electron/uitools.ts` | 30/min, burst 10, double cost for ask/confirm, injected clock |
| W1.5 | Catalog summarizer and read projections | `shared/pilotsummary.ts`, `shared/pilotread.ts`, `.test.ts` each | `shared/manual.ts` | `summarize()` under a token budget with groups; `publicSettings()` drops vault-backed keys (tested) |

Wave 2: main and IPC (depends on wave 1).

| # | Task | Files | Must not touch | Done when |
|---|---|---|---|---|
| W2.1 | Pilot tools server | `electron/pilottools.ts` (new), `.test.ts` | `electron/uitools.ts` tool bodies | `app_commands`, `app_describe`, `app_run`, read tools; run goes through gate, rate limit, audit; no vault reads (tested) |
| W2.2 | Gate and audit integration | `electron/policy.ts`, `electron/audit.ts` | `shared/policyrules.ts` grammar | `app_run:<id>` rules match; `by: 'pilot'` rows with tier and taint |
| W2.3 | Taint tracking and tool sets | `electron/session.ts` | `canUseTool` order | turn taint flag set after untrusted reads; Pilot session gets full set, others the default set |
| W2.4 | IPC | `shared/ipccontract.ts`, `.test.ts`, `electron/preload.cjs`, `electron/main.ts` (handlers, menu accelerator) | other channels | contract test covers `pilot:*`; timeout path tested |

Wave 3: UI and docs.

| # | Task | Files | Must not touch | Done when |
|---|---|---|---|---|
| W3.1 | Renderer runner | `src/pilotRun.ts`, `src/pilotRun.test.ts`, `src/App.tsx` (wire runner, shortcut) | `src/Palette.tsx` | every palette id has a spec or `agent: false` (test); results returned over `pilot:result` |
| W3.2 | Pilot sheet and actions list | `src/Pilot.tsx` (lazy), `src/PilotActions.tsx` | startup chunks, `src/ui/*` internals | no-native-ui passes; 215 KB budget holds; undo works per row |
| W3.3 | Guide and manual | `electron/guide.ts`, `shared/manual.ts`, `docs/STM_GUIDE.md` (via `npm run guide`) | `src/` | `APP_GUIDE` mentions the three tools; manual test passes |
| W3.4 | Docs | `docs/ROADMAP.md`, `docs/NETWORK.md` (only if a network change appears; none expected) | code | ROADMAP lists Pilot with this spec |

## Open questions

- Shortcut: `Mod+J` free on all platforms? Verify against the menu and existing key handlers.
- Default model for Pilot: which cheap model id, and is it available for every login type (API key, subscription)?
- Should `pilotEverywhere` let ordinary panels run ask-tier commands, or always route them to the Pilot?
- Where notifications and today's cost live in main today (exact modules to read from).
- Should undo of an ask-tier action itself ask, or is undoing the agent's own action always free?
- Taint scope: per turn (proposed) or per session after the first untrusted read?
