# Spec: smart scheduling and management for social posts

Branch: `claude/social-sched`, based on `claude/social-0.1.20`. Ideas were taken from how a well-known
scheduling tool works (weekly time slots, "next free slot", recommended times from engagement, approvals,
an AI writing helper, a comments inbox). Ideas only: no name, logo, copy text or look of that product goes
into the app.

## Goal

Let one person plan a week of posts across their connected networks without leaving SuperTokenMan: drop a
draft into a per-network queue, get a time from their own history, review a per-network rewrite, see the
week on the calendar, get evergreen posts suggested again, and triage replies in Mentions. Claude (Haiku on
the user's own plan, as Brief a post already does) is used only where judgement on text helps; timing math
stays deterministic.

## What already exists (read before changing anything)

- `app/electron/social/queue.ts`: `Item` with `when`, `approved`, `results`, `variants`, `comments`;
  `dueNetworks`, `stateOf`, `problem` (per-network rules, character limits). Nothing posts unless approved;
  a failure is never retried on its own; each result is written as it happens.
- `app/electron/social/service.ts`: `readQueue`/`writeQueue` (JSON file `d.queueFile`), `tick()` publishes
  due items, `cred()` reads `SOCIAL_<NET>` from the vault and refreshes tokens; `posts(n)` returns own
  recent posts with `at`, `likes`, `comments`, `shares`, `views` (where the network gives them).
- `app/electron/social/networks.ts`, `open.ts`: per-network adapters (Bluesky/Mastodon timelines).
- `app/shared/pubcal.ts` (+ test): `Slot {day,time}`, `weekOf`, `byDay`, `moveToDay`, `slotAt`,
  `checkSlots`, `nextFreeSlot`, `LIMITS`. `app/src/PubCalendar.tsx` renders the week.
- `app/shared/postbrief.ts`, `posteverywhere.ts`, `mentions.ts`, `accounts.ts` and their panels
  (`PostBrief.tsx`, `PostEverywhere.tsx`, `Mentions.tsx`, `Accounts.tsx`). LinkedIn sends
  `LinkedIn-Version: 202610` (`LINKEDIN_VERSION`).
- `app/electron/main.ts`: `setInterval(() => social.tick(), 60_000)` and a first tick after 20 s;
  in-app triggers (`tickTriggers`, `isDue`, `fireTimed`) on a 60 s interval, re-run 15 s after
  `powerMonitor` `resume`. Both live in the main process. **There is no background daemon, launchd agent or
  login item**; the triggers system only runs while the app runs.
- `docs/NETWORK.md`: one row per host with what is sent and when. `docs/BRAND.md`: flat Swiss look, 45 degree
  cut corner, no emoji, no pills, no shadows; changes to the look are written there in the same commit.

## Constraints

1. No network call unless the feature is on. Each new feature has an off-by-default switch; off means zero
   requests (the `netwatch:check` script must stay green).
2. Every host contacted is listed in `docs/NETWORK.md` (one row per host). This spec adds no new host: it
   reuses the posting and `posts()` hosts already listed. Rows that gain a new use get it added to their text.
3. Secrets only in the vault (`SOCIAL_<NET>` entries). Queue, slots and stats files hold no token.
4. UI text in English, plain, no emoji.
5. No macOS-native-looking controls: use `app/src/ui` (`Select`, `Checkbox`, `TimeField`, `DateTimeField`,
   buttons) and `StateMark`. `npm run no-native-ui` must pass.
6. Start-up JS budget is 215 KB gzip (`scripts/startup-size.mjs`). Every new panel or panel section is
   loaded with `lazy(() => import(...))`; nothing new is imported from the first screen.
7. Scheduler and scoring logic are pure functions in `app/shared/` with vitest tests; no Electron or React
   imports there. UI and IPC only call them.
8. Claude calls go through the existing Haiku path on the user's plan, show their cost like Brief a post,
   and every Claude output is a suggestion the person accepts or edits; nothing Claude writes is posted
   without the existing Approve step.

## Features

### F1. Per-network queue with weekly time slots
Each network gets its own weekly slots (`Slot[]`, e.g. Mon 09:00). "Add to queue" sets `when` to the next
free slot of that network (`nextFreeSlot`, per network). An exact date and time still overrides the queue.
Changing slots re-places queued (slot-placed) items but never items with a hand-picked time. A day can be
off. Pure logic: `app/shared/slots.ts`. Stored in the queue settings file, no network use.

### F2. Best time from our own past posts
Data: the person's own posts from `posts(n)` (time `at`, and `likes + comments + shares`, or `views` on
YouTube), cached locally after each Accounts refresh; no extra call. Score per weekday x hour bucket
(median engagement, in the person's time zone). Needs at least 12 posts over 3+ distinct buckets on that
network; otherwise the UI says "Not enough data yet for <Network>: N of 12 posts." and offers no times.
Output: up to 3 suggested slots with the number of posts behind each, and a one-click "Use as slots".
Deterministic, no Claude. Networks with no metrics (X without a paid tier, Telegram, Discord) show
"This network does not report engagement to the app."

### F3. Reviewed rewrite per network
From the main text, Haiku proposes one version per selected network that fits `problem()` and `LIMITS`
(length, link handling, tone of that network). Shown side by side with a diff and the character count;
the person accepts per network into `variants`, edits or discards. Re-checked with `problem()` before it
can be saved. Uses the existing Haiku runner; no social host contacted.

### F4. Recycle evergreen suggestion
Among posts already sent (queue `results.ok`) older than 30 days, pick candidates with engagement in the
top quartile for that network (from F2 cache) and no time-bound words (a date, "today", "this week",
version numbers: pure filter). Haiku then writes a fresh wording; the suggestion lands as an unapproved
draft in the queue. Never more than one suggestion per network per week; off by default.

### F5. Reply triage in Mentions
Mentions already fetches and drafts replies. Add a triage label per mention: `question`, `bug report`,
`praise`, `spam or noise`, `needs you` (Haiku, batched, cached by mention id), plus pure pre-filters (a
known spam pattern, a muted handle) that skip Claude. The list sorts by label and age; "spam or noise" is
folded away, never auto-hidden on the network. No auto-replies: Approve stays the only way to send.

### F6. Missed-post catch-up (honest firing)
See "How scheduled posts fire".

## How scheduled posts fire

- While the app is open: `social.tick()` runs every 60 s in the main process and publishes
  `dueNetworks()` of approved items. Precision is about one minute.
- When the Mac sleeps or the app is closed: nothing posts. There is no daemon, and the triggers system
  is in-process too, so it cannot help. The UI says this next to the schedule: "Posts go out only while
  SuperTokenMan is open and the Mac is awake."
- On wake (`powerMonitor` `resume`) and on launch, the app computes missed items with a pure
  `missed(items, now, graceMin)`. Items late by less than the grace (default 15 min) post right away.
  Items late by more are held as "Missed" and are not posted on their own. The person picks one of:
  "Post now", "Move to next slot", or "Skip". This avoids a burst of stale posts after a weekend closed.
- The app may offer to keep the Mac awake (`powerSaveBlocker` 'prevent-app-suspension') while an approved
  item is due within the next hour; off by default. A launchd agent is out of scope (open question).

## Tasks for Haiku workers

Each task touches only its own files. Done means the named check passes, plus `npm run typecheck` in `app/`.

### Wave 1 (no dependencies, run in parallel)

**T1 Slot queue logic.** Objective: pure per-network slot placement and re-placement.
Create: `app/shared/slots.ts`, `app/shared/slots.test.ts`. May edit: none. Must not touch: `pubcal.ts`,
`queue.ts`, any `src/` or `electron/` file. Done: `npx vitest run shared/slots.test.ts` (tests
`next free slot per network`, `replan keeps hand-picked times`, `day off has no slots`).

**T2 Best-time scoring.** Objective: bucket own posts and return suggestions or "not enough data".
Create: `app/shared/besttime.ts`, `app/shared/besttime.test.ts`. Must not touch: anything else.
Done: vitest `besttime` tests `under 12 posts says not enough data`, `median per weekday hour`,
`no metrics network`.

**T3 Missed-post rules.** Objective: pure `missed()` and `catchUp()` with a grace window.
Create: `app/shared/missed.ts`, `app/shared/missed.test.ts`. Must not touch: `queue.ts`, `main.ts`.
Done: vitest `missed` tests `inside grace posts`, `outside grace is held`, `unapproved is ignored`.

**T4 Evergreen and triage pre-filters.** Objective: pure candidate filter (age, quartile, time-bound
words) and mention pre-filters (spam pattern, muted handle).
Create: `app/shared/evergreen.ts`, `app/shared/evergreen.test.ts`, `app/shared/triage.ts`,
`app/shared/triage.test.ts`. Must not touch: `mentions.ts`. Done: vitest `evergreen` and `triage`.

**T5 Prompts.** Objective: prompt builders and output parsers for rewrite, evergreen wording and triage
labels, rejecting output that fails `problem()` limits or an unknown label.
Create: `app/shared/socialprompts.ts`, `app/shared/socialprompts.test.ts`. Done: vitest `socialprompts`.

### Wave 2 (needs wave 1)

**T6 Main process wiring.** Objective: store slots and stats cache, expose IPC, run catch-up on launch and
`resume`, Haiku calls for F3 to F5, feature switches off by default.
Edit: `app/electron/social/service.ts`, `app/electron/social/store.ts`, `app/electron/main.ts` (only the
social block near the `social.tick()` interval and the IPC handlers), `app/electron/preload.cjs`,
`app/src/bridge.ts`, `app/shared/ipccontract.test.ts`. Must not touch: `shared/*` from wave 1, any panel.
Done: `npm test`, `npm run typecheck`, `npm run netwatch:check`.

### Wave 3 (needs T6; parallel, different files)

**T7 Queue and calendar UI.** Slots editor, "Add to queue", Missed state and its three actions, best-time
card. Create: `app/src/SlotsEditor.tsx`, `app/src/BestTime.tsx` (both lazy). Edit: `app/src/PubCalendar.tsx`.
Must not touch: `App.tsx`, other panels. Done: `npm run typecheck`, `npm run no-native-ui`,
`npm run build && node scripts/startup-size.mjs`.

**T8 Rewrite review UI.** Create: `app/src/RewriteReview.tsx` (lazy). Edit: `app/src/PostEverywhere.tsx`.
Done: as T7.

**T9 Mentions triage UI and evergreen card.** Edit: `app/src/Mentions.tsx`; create
`app/src/Evergreen.tsx` (lazy). Done: as T7.

**T10 Docs.** Edit: `docs/NETWORK.md` (new uses on existing rows, "only while the app is open"),
`docs/ROADMAP.md`, `docs/BRAND.md` only if a new component look is added. Must not touch code.
Done: every host in `electron/social/*` appears in NETWORK.md (manual grep check).

## Open questions for the owner

1. Should a launchd agent (or a login item started hidden) post while the window is closed? It is new
   surface: a process that holds vault access with no window.
2. Grace window default 15 min, and is "Missed" a hold or a skip by default?
3. Thresholds for best time: 12 posts and 3 buckets, and is engagement a raw sum or per follower?
4. Is evergreen recycling wanted on X and LinkedIn, where repeats can look like spam?
5. Triage labels: is this set right, and may triage run on every poll (Haiku cost) or only on open?
