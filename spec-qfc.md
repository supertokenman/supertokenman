# Spec: panel queue, failover with notice, team channel

Status: spec only. Branch `claude/queue-failover-channel`. Ideas only from a public product page; no names, wording or code taken from it.

## Goal

1. Let the person keep typing while a panel works, and manage what is waiting.
2. When a turn fails on a plan or rate limit, or the API is down, offer a fallback openly, never silently.
3. Turn the panel-to-panel ask and the group room into one persistent, per-team channel.

## Non-goals

- No new hosts, accounts or sync. The team channel is local; the encrypted relay room (`src/teamRoom.ts`) stays as it is.
- No automatic spending: every send, wake and switch goes through the existing approvals, `stmLimits`, link `auto` and link caps.
- No new model providers; fallbacks reuse models and `customEndpoint` / `providers` already in `main.ts`.
- No cross-panel queue scheduling or priorities beyond order within one panel.

## What exists (checked)

- `electron/session.ts`: one long-lived SDK query fed by an async prompt queue (`push`/`end`, line ~42); `interrupt()` (line ~560) calls the SDK `q.interrupt()`; `stoppedByApp` marks app-made stops; results carry `subtype` and `is_error` (line ~387); `rate_limit_event` becomes `{ kind: 'limits', windows }` with `resetsAt`.
- `electron/main.ts`: `track()` (line ~629) records usage and limits; `liveLimits` (line ~7484); `customEndpoint` (line ~3338); `providers()` (line ~7400); `stmLimits` and `sendLimit`/`spawnLimit` (line ~6523).
- `electron/panelbus.ts`: `Link { a, b, auto, capUsd, spent }`, `deliveryOf()` queued vs auto, `DEFAULT_LIMITS`.
- `electron/hub.ts`: wait graph that refuses cycles.
- `shared/teambus.ts` (asks, depth 2, 3 open per panel), `shared/askroute.ts` (claim an ask from a composer send), `shared/teambundle.ts` (team definition, up to 12 panels).
- `src/Canvas.tsx` room state; `electron/uitools.ts` stm MCP tools.
- `shared/mentions.ts` already exists (social mentions): new files must not reuse that name.

The SDK takes new user messages through the streaming input while a turn runs; it does not expose a "deliver at next boundary" call. An interrupt stops the current turn; the next pushed prompt then starts a new turn. "Steer at the next boundary" is therefore built by the app: hold the steer until the turn's `result`, then push it first.

## Feature 1: panel message queue

Behaviour
- While a turn runs, Send adds an item to the panel's queue instead of pushing to the session. Items render under the composer as a compact list.
- Each item: edit (inline), cancel, move up/down (drag optional), and a queue-wide Pause/Resume. When the turn ends and the queue is not paused, the head item is pushed. One item per turn.
- Steer: an item marked steer goes to the head. Two modes:
  - "Next turn" (default): sent when the current turn ends.
  - "Interrupt": calls `session.interrupt()` with `stoppedByApp` set, then sends the steer as soon as the interrupted `result` arrives. Labelled clearly; the partial turn stays in the transcript.
- Persisted per panel (survives reload and restart). On load, a queue is always paused; the person resumes it. This avoids spending on start.
- Cost: when the queue has 3 or more items, show "about $X for N turns" from the panel's recent average turn cost (median of last 10 turns, from usage records); show "unknown" with no history.
- Asks delivered as queued (`deliveryOf` = queued) appear as queue items with their ask id, so `askroute.claim` keeps working.

Edge cases
- Turn fails: queue pauses itself and shows why (no draining into an error loop). If the failure is a limit, Feature 2 takes over.
- Editing the item being sent: items in `sending` are read-only.
- Panel closed: queue kept with the panel record; deleted with the panel.
- Budget (`budget` limits) or loop guard blocks a send: item stays, queue pauses.
- Cap: 50 items, 20 000 chars each.

Data
```ts
type QueueItem = { id: string; text: string; at: number; steer?: 'next' | 'interrupt'; askId?: string; state: 'waiting' | 'sending' }
type PanelQueue = { items: QueueItem[]; paused: boolean; pauseReason?: string }
type QueueAction =
  | { t: 'add'; item } | { t: 'edit'; id; text } | { t: 'cancel'; id } | { t: 'move'; id; to: number }
  | { t: 'steer'; id; mode } | { t: 'pause'; reason? } | { t: 'resume' }
  | { t: 'turnEnded'; ok: boolean } | { t: 'sent'; id } | { t: 'loaded' }
```
Pure reducer `reduce(q, a)` plus `nextToSend(q, busy)` and `estimate(q, recentCosts)`. Stored in main settings keyed by panel id (`panelQueues`), written through the existing settings save.

## Feature 2: failover with notice

Error kinds (pure classifier over the result text, `subtype`, HTTP status if present, and the last limit windows):
- `plan_window` (5-hour or 7-day usage limit reached; reset time from text or `liveLimits`),
- `rate_limit` (429), `overloaded` (529 / "overloaded"), `api_down` (5xx, connection refused/reset, DNS, timeout),
- `other` (no failover offered: auth, bad request, context too long, tool errors, app stops).

Behaviour
- On a classified failure the panel shows a card: the reason, the reset time if known ("resets 14:30"), and the configured fallback. Buttons: Switch, Wait until reset, Cancel. A checkbox "Always switch for this panel" (off by default; stored per panel).
- Switch: change the panel's model, or its endpoint/provider profile, then resend the failed prompt. Same session id/transcript: model change uses the SDK's set-model on the live query; an endpoint change restarts the query with resume on the same session id, as panels already do when switching provider. If resume is not possible the card says so and offers Cancel only.
- Wait: schedule a resend at `resetsAt` (+30 s), shown as a countdown on the card; for `overloaded`/`api_down` without a reset, back off 1, 2, 5, 10 min, max 4 tries, each try visible. The queue stays paused until then.
- Cancel: nothing resent; queue stays paused.
- "Always switch" still writes a visible notice line in the transcript; it is never silent. It never applies to a fallback that costs money on a different account unless that endpoint was already approved for the panel.
- Back to primary: after the reset time, a small notice offers "Return to <primary>"; no automatic return in v1.
- Each switch is recorded: a `note` event in the transcript ("Switched from opus to sonnet: 5-hour limit reached, resets 14:30") and a usage log row `{ kind: 'failover', from, to, reason, resetsAt }` through `track()`.

Edge cases: fallback equals current model (no card, show the error); fallback also fails (card again, no chain beyond one hop per prompt); a fallback that is a custom endpoint that is off (shown disabled with the reason); multiple panels hitting the same limit (each gets its own card); failure during an interrupt steer (treated as `other`).

Data
```ts
type FailKind = 'plan_window' | 'rate_limit' | 'overloaded' | 'api_down' | 'other'
type Failure = { kind: FailKind; window?: 'five_hour' | 'seven_day'; resetsAt?: string; status?: number; raw: string }
type Fallback = { model?: string; provider?: string /* provider keyName or 'custom' */ }
type FailoverPrefs = { fallback?: Fallback; always?: boolean }   // per panel
type Decision = { act: 'card' | 'switch' | 'none'; reason: string; waitUntil?: string }
```
`classify(input, windows, now)` and `decide(failure, prefs, current)` are pure. Fixtures: real messages copied from our own logs and SDK result texts into `shared/__fixtures__/failover/*.txt` (one per kind, plus near misses such as a 429 inside a tool output).

## Feature 3: team channel

Behaviour
- One channel per team (team from `teambundle`). Linked panels and the person post. Post kinds: `handoff`, `question`, `review`, `result`, `note`.
- A pane lists posts newest at the bottom, filter by kind or panel, composer for the person with @panel completion.
- `@panel` in a post creates a wake for that panel. Delivery uses the existing path: `deliveryOf(link)`; `queued` puts it in that panel's queue (Feature 1) for the person to send; `auto` sends only within `sendLimit`, link `capUsd` and the hub's cycle check. Posts by the person mentioning a panel are delivered as queued unless the person presses "Send now".
- Depth: a wake carries depth; reuse `teambus.MAX_DEPTH` (2). Mentions in a post made during a wake turn carry depth+1. At most 3 open wakes per panel (as asks).
- `stm ask` stays; it also writes a `question` post and its reply a `result` post, so the channel shows the history.
- The relay room is not merged: it is cross-machine; this channel is local.

Storage: `userData/channels/<teamId>.jsonl`, append-only; cap 2 000 posts or 2 MB per team, pruning oldest non-pinned posts on write; per post body max 8 000 chars. Pins (max 20) survive pruning.

Data
```ts
type Post = { id: string; team: string; from: string /* panel id or 'you' */; kind: 'handoff'|'question'|'review'|'result'|'note'; text: string; mentions: string[]; at: number; depth: number; pinned?: boolean; replyTo?: string }
type Wake = { post: string; to: string; delivery: 'queued' | 'auto' | 'refused'; why?: string }
```
Pure: `parseMentions(text, panels)`, `route(post, links, open, limits)` → `Wake[]`, `prune(posts, caps)`, `unread(posts, panel, lastSeen)`.

## IPC (all added to `shared/ipccontract.ts` with zod args)

- `queue:get(panel)`, `queue:act(panel, action)`; event `queue:changed`.
- `failover:prefs:get(panel)`, `failover:prefs:set(panel, prefs)`, `failover:choose(panel, cardId, 'switch'|'wait'|'cancel', always?)`; event `failover:card`.
- `channel:list(team, { before?, limit })`, `channel:post(team, { kind, text, replyTo? })`, `channel:pin(team, id, on)`, `channel:sendNow(team, wakeId)`; event `channel:posted`.

## MCP tools (stm server, `electron/uitools.ts`)

- `channel_post({ kind, text, replyTo? })`: posts as the calling panel to its team; mentions routed as above. Counts against `sendLimit`.
- `channel_read({ since?, limit? <= 50 })`: recent posts, text truncated to 2 000 chars each.
- `channel_mentions({ unreadOnly = true })`: posts mentioning the calling panel; marks them read.
A panel not in a team gets a clear error.

## UI

- Queue: `src/QueueList.tsx` under the composer, lazy-loaded when a queue is non-empty. Uses existing buttons, menus and rows; `npm run no-native-ui` passes.
- Failover card: `src/FailoverCard.tsx` in the panel stream, lazy; fallback setting in the panel's model menu (`src/ModelMenu.tsx`), off by default.
- Channel pane: `src/ChannelPane.tsx`, `React.lazy` from the team view (`src/Team.tsx`) and the canvas; unread count badge only in the eager bundle.
- No emoji; English text; startup JS stays under 215 KB gzip (check `docs/PERFORMANCE.md` method).

## Network

No new hosts. A fallback to a custom endpoint uses an endpoint the person already configured. `docs/NETWORK.md` gets one line stating the features add no hosts.

## Risks

- Classifier false positives offering a switch on a non-limit error: mitigated by fixtures and near-miss tests; unknown → `other`.
- Endpoint switch losing context if resume fails: card refuses to switch rather than silently start fresh.
- Auto-wakes chaining spend: depth cap, open-wake cap, `sendLimit`, link caps, hub cycle check.
- Queue draining unattended after restart: queues load paused.
- Settings file growth: channel in its own jsonl; queue capped.
- Interrupt mid tool call may leave partial edits: the interrupt mode is labelled and not default.

## Tasks

Wave 1 (pure `app/shared`, vitest; no electron/src edits)
- W1.1 Queue reducer. Create `shared/panelqueue.ts`, `shared/panelqueue.test.ts`. Do not touch `askroute.ts`, `teambus.ts`. Done: add/edit/cancel/move/steer/pause/resume/turnEnded/loaded, caps, `nextToSend`, `estimate` tested.
- W1.2 Error classifier. Create `shared/failkind.ts`, `shared/failkind.test.ts`, `shared/__fixtures__/failover/`. Do not touch `electron/session.ts`. Done: each fixture maps to its kind; near misses map to `other`; reset time parsed.
- W1.3 Failover decision. Create `shared/failover.ts`, `shared/failover.test.ts` (imports `failkind.ts`). Done: card vs switch vs none, same-model guard, one hop, backoff schedule.
- W1.4 Channel store and pruning. Create `shared/teamchannel.ts`, `shared/teamchannel.test.ts`. Do not touch `teamRoom.ts`, `mentions.ts`. Done: append, caps by count and bytes, pins kept, unread.
- W1.5 Mention routing. Create `shared/chanroute.ts`, `shared/chanroute.test.ts` (pure copy of the link rule; no import from electron). Done: parse @panel, queued/auto/refused with depth, open-wake cap, self-mention ignored.

Wave 2 (main and session)
- W2.1 Queue wiring. Edit `electron/main.ts`, `electron/session.ts` (turn-end hook, steer after interrupt), `shared/ipccontract.ts`, `electron/preload.cjs`. Do not touch `src/`. Done: queued item sent on turn end; survives restart paused; session tests extended.
- W2.2 Failover wiring. Edit `electron/session.ts` (surface status/raw on error results), `electron/main.ts` (card event, switch, wait timer, `track` row, transcript note), `shared/ipccontract.ts`. Do not touch `panelbus.ts`. Done: a fixture-fed fake result produces a card; switch keeps session id; log row written.
- W2.3 Channel wiring. Edit `electron/main.ts` (jsonl store under userData, IPC), `electron/uitools.ts` (3 MCP tools), ask hooks to mirror posts, `shared/ipccontract.ts`. Do not touch `panelbus.ts` limits. Done: tool calls post/read/mention; auto wake obeys `sendLimit` and caps in a test.

Wave 3 (UI and docs)
- W3.1 `src/QueueList.tsx` + composer hook. Do not touch `electron/`. Done: lazy chunk, no-native-ui passes.
- W3.2 `src/FailoverCard.tsx`, `src/ModelMenu.tsx` fallback setting. Done: three buttons and checkbox work against W2.2.
- W3.3 `src/ChannelPane.tsx`, entry in `src/Team.tsx` and `src/Canvas.tsx`. Done: lazy, unread badge, startup budget check passes.
- W3.4 Docs: `docs/STM_GUIDE.md` (channel tools), `docs/NETWORK.md` (no new hosts), `docs/ROADMAP.md` ticks. Done: docs match behaviour.

## Open questions (with recommendation)

1. Should steer default to interrupt? Recommend no: next-turn by default, interrupt opt-in per item.
2. Where to persist queues: settings or own file? Recommend settings (small, capped at 50) to reuse save path.
3. Return to primary model automatically after reset? Recommend no in v1; show an offer.
4. Default fallback when none configured? Recommend none: the card offers Wait and Cancel and a link to set one.
5. Should `stm ask` be replaced by the channel? Recommend keep it and mirror into the channel.
6. Channel retention numbers? Recommend 2 000 posts / 2 MB per team, 20 pins.
7. Can a person's post auto-wake an auto-linked panel? Recommend queued by default with an explicit "Send now".
