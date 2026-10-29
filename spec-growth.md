# Spec: growth patterns (many accounts, projects, hooks, honest metrics)

Branch: `claude/social-sched`. Builds on `spec.md` (F1 to F6). Do not start before F1 (`app/shared/postslots.ts`)
and F2 (`app/shared/besttime.ts`) are merged; this spec changes how both are keyed.

## Source and its limits

Ideas come from an X article (pt-BR, adapted from @theoxmotion) that looked at the 12 latest Reels of 53
AI-animated Instagram pages: 22 of 53 had a Reel over 10M views; pages with 2 recurring characters had a
median near 112.8K views, 1 character near 110K, none near 30.2K; on the median page the top Reel brought
45% of the page's views; four caption formats repeat (choice question, "when he/she ___", "Facts:",
"send this to the one who ___"); some operators run several accounts on one schedule about 20 minutes apart.

**The sample is biased toward winners.** It only holds pages that succeeded; pages that used the same
characters and captions and failed are not in it. Nothing in the app may present these numbers as
expected results. The app never shows a view count it did not measure from the user's own accounts.
Any in-app mention of the study carries the line: "From a study of successful pages only. Not a forecast."

## Owner context

Several projects, each with several social accounts. Today there is one account per network
(vault entry `SOCIAL_<NET>`, `credName` in `app/electron/social/store.ts:7`).

## Hard rules (apply to every task)

1. No scraping of Instagram, X or any network, nothing against their terms. Data only from official APIs
   for the user's own connected accounts, or from text/files the user pastes or imports.
2. Studies are labelled as biased toward winners (line above). No made-up or projected view numbers.
3. No network call unless the feature is on; each feature has an off-by-default switch. This spec adds
   **no new host**: posting and `posts()` hosts already in `docs/NETWORK.md` are reused; rows gain text
   where a use is new (per-account fetches). "Research a niche" never fetches pasted links.
4. Secrets only in the vault. Project and account files hold account ids, handles, names; never tokens.
5. UI lazy-loaded (`lazy(() => import(...))`), start-up budget 215 KB gzip, no emoji, `app/src/ui`
   components and `StateMark`, `npm run no-native-ui` green, `docs/BRAND.md` look.
6. Pure logic in `app/shared/` with vitest tests, no Electron/React imports. Claude only via the existing
   Haiku path with cost shown; Claude output is a suggestion; nothing posts without Approve.

## Features

### G1. Accounts and projects
Many accounts per network. An account is `{ id, net, handle, name }`; `id` = `<net>:<handle-lowercased>`.
Vault key `SOCIAL_<NET>_<HANDLE>` (handle upper-cased, non `[A-Z0-9]` replaced by `_`; collisions get
`_2`, `_3`). A project is `{ id, name, accountIds[], brandKit }` stored in the plain social state file; it
holds account ids only.

Migration (once, on first start of the new version, idempotent): for each existing `SOCIAL_<NET>` entry,
read the handle from the cred (`ids.handle`, or the network's "me" call already used by `posts()` only if
the social feature is on; else handle `default`), write `SOCIAL_<NET>_<HANDLE>`, then delete the old key
only after the new one reads back. Queue items with `network` get `account` = the migrated id. A project
"Default" holds all migrated accounts. A failed step leaves the old key in place and is retried next start.

### G2. Hook library (Claude)
Four built-in caption formats as templates with a slot: `choice` ("A or B?"), `when` ("When he/she ___"),
`facts` ("Facts: ___"), `sendto` ("Send this to the one who ___"). Users can add their own. Claude (Haiku)
fills N variants per template using the project's brand kit (tone, characters, banned words); output is
parsed and validated (length per network via `problem` in `queue.ts`, template shape kept). Shown as
suggestions to insert into a draft. No claim that a format "gets views".

### G3. Hit concentration (math)
Per account, from own `posts(n)` metrics: share of the top post in total views (or engagement when views
are absent) over the last N posts (default 12, same window as the study for comparison), plus top-3 share
and post count. Below 6 posts with a metric: "not enough data". Shown with the study's 45% only as a
labelled reference line with the bias notice, never as a target.

### G4. Brand kit: recurring characters and series
Per project: tone, banned words, characters (`{ name, look, voice }`, max 6) and series
(`{ name, characterIds, format, cadence }`). Feeds G2 prompts and the Brief a post prompt. Plain data,
no images uploaded anywhere. Optional tag `series` on a queue item so G3 can split concentration by series
(own data only).

### G5. Staggered multi-account scheduling
One shared slot set per project; each account in it posts at slot + offset (`k * gap`, default gap 20
min, user-set). Per-account rate limits: max posts per day and minimum gap between two posts of the same
account (defaults per network, user can lower, not raise above a network's documented limit). The planner
refuses placements that break a limit and says why.

### G6. Research a niche (Claude, user data only)
The user pastes text (captions, notes) or imports a CSV/JSON export they own (columns: caption, date,
views optional). No link is fetched; a pasted URL is kept as a label. Claude classifies captions into the
G2 formats and proposes new templates; math (counts per format, median of user-provided views) is local.
Output carries the bias notice and "Numbers are from your import, not measured by the app."

## Changes to F1 and F2

- `postslots.ts`: `SlotItem.network` stays; add optional `account?: string`. Keying moves from network to
  account: `NetSlots` keys may be an account id; `nextSlotFor`/`replan` match on `account ?? network`.
  Staggering and limits live in a new module (`stagger.ts`) that wraps `nextSlotFor`; `postslots.ts` gets
  only the key change, existing tests must stay green.
- `besttime.ts`: unchanged signature; callers pass posts of one account instead of one network. Add no
  account logic inside it. The IPC layer groups `posts()` by account.

## New files (checked free in `app/shared/` on this branch)

`socaccounts.ts`, `hookfmt.ts`, `hitshare.ts`, `brandkit.ts`, `stagger.ts`, `nichenotes.ts` (+ `.test.ts`
each). Do NOT use `slots.ts`, `accounts.ts`, `social.ts`, `research.ts`, `patterns.ts`, `personas.ts`
(existing).

## Tasks for Haiku workers

Done for every task also means `npm run typecheck` in `app/`. No task touches `spec.md`.

### Wave 1 (pure logic, parallel)

**H1 Account ids and migration plan.** Create `app/shared/socaccounts.ts`, `socaccounts.test.ts`:
`accountId`, `vaultKey(net, handle)` (sanitising, collision suffix given existing keys), `planMigration(oldKeys,
handles) -> steps[]`, `Project` type and `validateProject` (rejects any field that looks like a token).
Must not touch: `accounts.ts`, `electron/`, `src/`. Done: `npx vitest run shared/socaccounts.test.ts`
(tests `key sanitised`, `collision suffix`, `migration idempotent`, `project holds ids only`).

**H2 Hook templates.** Create `app/shared/hookfmt.ts`, `hookfmt.test.ts`: the four built-ins, `fill`,
`detectFormat(caption)`, `validateHook`. Must not touch: `socialprompts.ts`. Done: vitest on the file.

**H3 Hit concentration.** Create `app/shared/hitshare.ts`, `hitshare.test.ts`: `hitShare(posts: OwnPost[], n)`
-> `{kind:'not-enough'} | {kind:'ok', top, top3, posts, metric}`; imports `OwnPost` type from `besttime.ts`
only. Must not touch: `besttime.ts`. Done: vitest (`zero views`, `ties`, `fallback to engagement`).

**H4 Brand kit.** Create `app/shared/brandkit.ts`, `brandkit.test.ts`: types, `cleanBrandKit`, limits
(6 characters), `brandBlock(kit)` text for prompts. Done: vitest.

**H5 Stagger and rate limits.** Create `app/shared/stagger.ts`, `stagger.test.ts`: `staggerPlan(slots,
accountIds, gapMin, limits, queue, now)`, `checkLimits`. Imports from `postslots.ts`, `pubcal.ts`; edits
neither. Done: vitest (`20 min offsets`, `daily cap refuses`, `min gap refuses`).

**H6 Niche import parse.** Create `app/shared/nichenotes.ts`, `nichenotes.test.ts`: parse pasted text and
CSV/JSON, never fetch, counts per format via `hookfmt.detectFormat`, median of given views. Depends on H2
only for import; may stub. Done: vitest (`url kept as label`, `no fetch` by asserting no `fetch` import).

### Wave 2 (needs wave 1)

**H7 postslots account key.** Edit `app/shared/postslots.ts`, `postslots.test.ts` (add tests only):
`account ?? network` keying. Must not touch other files. Done: old and new tests pass.

**H8 Prompts.** Edit `app/shared/socialprompts.ts`, `socialprompts.test.ts`: `hookPrompt`/`parseHooks`,
`nichePrompt`/`parseNiche`, using `brandBlock`. Done: vitest.

**H9 Vault migration and per-account creds.** Edit `app/electron/social/store.ts`, `service.ts`,
`social.test.ts`: `credName(net, handle)`, run `planMigration` at start, per-account `posts()`. Must not touch
`src/`. Done: `npx vitest run electron/social` incl. `migrates SOCIAL_X once`, `old key kept on failure`.

### Wave 3 (UI, needs wave 2, different files)

**H10 Projects and accounts panel.** Create `app/src/Projects.tsx` (lazy); edit `Accounts.tsx` for a list
per network. **H11 Hooks and brand kit panel.** Create `app/src/HookLibrary.tsx` (lazy). **H12 Metrics:**
hit share in a lazy section of the existing stats view, with bias notice. **H13 Niche import panel:**
create `app/src/NicheImport.tsx` (lazy). Each: `npm run no-native-ui`, `node scripts/startup-size.mjs`
under 215 KB, edit `docs/NETWORK.md` row text only where a per-account fetch is new.

## Open questions for the owner

1. Handle source on migration when the feature is off: keep `default` until first connect?
2. Default stagger gap (20 min) and daily caps per network: who sets the ceilings?
3. Is Instagram/TikTok posting in scope? Today `ACCOUNTS` has no Instagram; G3 for Reels needs the official
   Instagram Graph API (business accounts) and a new host row.
4. Should the 45% reference line be shown at all, or only in help text?
5. May one draft go to several accounts of the same network (risk of duplicate-content rules)?
