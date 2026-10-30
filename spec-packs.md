# Spec: Packs

Status: proposal. Nothing here is implemented yet.

## 1. Goal

A Pack is an installable bundle of Claude Code skills, MCP server configs and rules (CLAUDE.md
fragments). SuperTokenMan gets a catalog of Packs, a review screen that shows everything a pack will
do before it does it, versioned install/update/remove with rollback and safe handling of user edits,
and an Eval that runs the same task with and without a pack and compares result, turns, tokens and cost.

Packs install per project (the panel's folder) by default, or globally when the user picks that.

Research sources (ideas only, nothing copied into product names, wording or art):
google/agents-cli (skills plus a CLI, multi-agent install, update and eval) and
aws/agent-toolkit-for-aws (bundles of a hosted MCP endpoint, skills and rules, installed with `npx skills add`).

## 2. Non-goals

- No public pack store, publishing, accounts, ratings or signing service (the ROADMAP "plugin store"
  item stays under Later).
- No install-time scripts, hooks, postinstall, or builds from a pack. Ever.
- No installing into agents other than Claude Code panels.
- No automatic updates from git; updating from a URL is always a click.
- No merging of arbitrary JSON beyond `mcpServers` entries the pack declared.
- No new native UI (dialogs, `<select>`, `title=` tooltips): the `no-native-ui` guard
  (`app/scripts/no-native-ui.mjs`) applies.

## 3. Where Packs fit in the existing code

- MCP for panels is assembled in `app/electron/main.ts` (~line 2043) as an `mcpServers` object passed
  to `Session` (`app/electron/session.ts:188`). Built-in servers include `stm`
  (`manualServer` in `app/electron/guide.ts`), `mem`, `code`, `symbols`, `headroom`, `local-model`.
  Enabled pack servers are merged here per session, keyed `pack-<packId>-<server>`, never overriding
  a built-in key.
- `app/electron/registry.ts` already reads user, local-project and `.mcp.json` servers for display;
  pack servers show there with origin "pack <id>".
- `app/electron/mcpcat.ts` already writes `mcpServers` into Claude config files; Packs reuse its
  read-modify-write helper rather than adding a second writer.
- Skills the app ships live in `app/engines/skills/` (today `obsidian-skills/` with `json-canvas`,
  `obsidian-markdown`, `LICENSE`, `SOURCE.md`). The task text said `app/resources/skills`; that folder
  does not exist. The catalog lists `app/engines/skills/*` as read-only "Shipped" packs, each with a
  synthesized manifest (skills only, no hosts, no env).
- Worktrees: `app/electron/worktree.ts` (`createWorktree`, `worktreeStat`, `dropWorktree`).
  Fan-out ranking: `app/shared/fanout.ts` (`Attempt`, `rank`, `whyFirst`). Cost and tokens come from
  the existing per-session usage counters. Eval reuses all three.
- IPC arguments for channels that write files or run commands are checked by zod in
  `app/shared/ipccontract.ts` (`CONTRACT`). Every `packs:*` channel is added there.
- UI: lazy-loaded screens (`lazy(() => import(...))`, as in `app/src/Accounts.tsx`); startup JS budget
  215 KB gzip enforced by `app/scripts/startup-size.mjs`. App components only; no emoji (docs/BRAND.md).

## 4. Manifest schema

File `pack.json` at the pack root (JSON only; YAML adds a parser to the bundle for no gain).

| Field | Type | Rules |
|---|---|---|
| `schema` | `1` | literal |
| `id` | string | `^[a-z0-9][a-z0-9-]{1,47}$` |
| `name` | string | 1..60 chars, no control chars |
| `version` | string | semver `MAJOR.MINOR.PATCH` (prerelease allowed) |
| `description` | string | <= 500 chars |
| `files` | array of `{ from, to, kind }` | `kind`: `skill` or `file`; `from` relative inside the pack; `to` relative inside the target root; max 200 entries, max 1 MB each, 10 MB total |
| `mcp` | array of server | see below; max 10 |
| `hosts` | array of string | hostnames only (`api.example.com`, `*.example.com` one level), no scheme, port or path |
| `env` | array of `{ name, why, secret }` | `name` `^[A-Z][A-Z0-9_]{0,63}$` |
| `rules` | `{ text }` or omitted | Markdown <= 8 KB, added to CLAUDE.md in a fenced block |

MCP server, one of:
- `{ "name", "type": "stdio", "command", "args": [], "env": ["VAR"] }`: `command` is a bare program
  name from an allowlist (`npx`, `uvx`, `node`, `python3`, `docker`) or a path inside the installed
  pack folder; `env` lists names only, values come from the vault at start.
- `{ "name", "type": "http" | "sse", "url" }`: `https://` only (http only for `127.0.0.1`/`localhost`);
  the URL host must appear in `hosts`.

Strict validation: unknown keys are errors (zod `.strict()`), every `env` name used by a server must be
declared in `env`, every remote host must be declared in `hosts`, ids unique, `to` paths unique.

Path rules (for `from` and `to`): reject absolute paths, drive letters, `~`, any `..` segment, empty
segments, NUL and control chars, backslashes, names longer than 255; after resolving, the real path must
stay inside the root; `to` may only land under `.claude/skills/<packId>/` (skills) or
`.claude/packs/<packId>/` (other files). Any symlink in the pack source, or an existing symlink on the
target path, is rejected (checked with `lstat` in main; the pure layer receives the `lstat` results).
CLAUDE.md and `.mcp.json` are never `files` targets: they change only through `rules` and `mcp`.

Example:

```json
{
  "schema": 1,
  "id": "postgres-helper",
  "name": "Postgres helper",
  "version": "1.2.0",
  "description": "Skills and a read-only database server for working with Postgres.",
  "files": [
    { "from": "skills/query-plan/SKILL.md", "to": ".claude/skills/postgres-helper/query-plan/SKILL.md", "kind": "skill" }
  ],
  "mcp": [
    { "name": "pg", "type": "stdio", "command": "npx", "args": ["-y", "@example/pg-mcp@3.1.0", "--read-only"], "env": ["DATABASE_URL"] },
    { "name": "docs", "type": "http", "url": "https://docs.example.com/mcp" }
  ],
  "hosts": ["docs.example.com", "registry.npmjs.org"],
  "env": [{ "name": "DATABASE_URL", "why": "Connection string for the pg server", "secret": true }],
  "rules": { "text": "Prefer EXPLAIN ANALYZE before suggesting an index." }
}
```

Note `npx` fetching a package is a network call: a stdio command of `npx`/`uvx`/`docker` requires the
registry host to be listed in `hosts`, or validation fails.

## 5. Sources and catalog

- Built-in: `app/engines/packs/<id>/pack.json` (shipped in the app, read-only).
- Shipped skills: `app/engines/skills/*`, synthesized manifests.
- User folder: any local folder the user adds (copied into the store on install, never linked).
- Git URL: `https://` only. Fetching is a network call: a "Fetch" button, the host shown on it, a
  shallow clone (`git clone --depth 1 --no-checkout`, then checkout with `core.symlinks=false`,
  hooks disabled via `core.hooksPath=/dev/null`, no submodules, no LFS) into a quarantine folder.
  Nothing in it is executed.

## 6. Install layout and state

Store (app data, one copy per version, kept for rollback):

```
<userData>/packs/store/<id>/<version>/        exact pack contents as reviewed
<userData>/packs/state.json                   all installs
```

Project install (target root = panel cwd):

```
<cwd>/.claude/skills/<id>/...                 skill files
<cwd>/.claude/packs/<id>/...                  other files
<cwd>/CLAUDE.md                               rules inside markers:
   <!-- stm-pack:<id> v<version> start --> ... <!-- stm-pack:<id> end -->
```

MCP: not written to `.mcp.json` by default. Enabled servers are injected into the panel's per-session
`mcpServers` (main.ts) only while enabled for that project, so nothing starts and no host is contacted
until the user turns it on. Option "Also write to .mcp.json" (off) for sharing with the team; when on,
the entries go through the `mcpcat.ts` writer and are tracked like files.

Global install: target root = `~/.claude` (skills in `~/.claude/skills/<id>`, rules in
`~/.claude/CLAUDE.md`); MCP enabling is still per project.

`state.json` (validated with zod on read; unknown version means read-only and a warning):

```json
{
  "schema": 1,
  "installs": [{
    "packId": "postgres-helper",
    "scope": "project",
    "root": "/Users/x/code/app",
    "version": "1.2.0",
    "previous": "1.1.0",
    "source": { "kind": "git", "url": "https://github.com/x/pg-pack", "commit": "abc123" },
    "installedAt": 1761800000000,
    "files": [{ "to": ".claude/skills/postgres-helper/query-plan/SKILL.md", "sha256": "..." }],
    "rulesSha256": "...",
    "mcpEnabled": { "pg": false, "docs": false },
    "hostsApproved": ["docs.example.com", "registry.npmjs.org"]
  }]
}
```

The hash recorded is of the bytes the pack wrote (the base for three-way decisions). Writes to
state.json are atomic (temp file + rename).

## 7. Install, update, remove

Install plan (pure, `planInstall(manifest, existing lstat/hash map, state)`) returns ordered ops:
`mkdir`, `write`, `rulesUpsert`, `stateRecord`, plus conflicts (target file exists and is not ours,
target is a symlink). Any conflict blocks until the user picks Skip or Overwrite (overwrite keeps a
`.stm-backup` copy). Main applies ops; on any failure it rolls back what it wrote in this run.

Three-way decision per file on update (`base` = hash in state, `user` = hash on disk now,
`new` = hash in the new version):

| base vs user | base vs new | Decision |
|---|---|---|
| same | same | keep |
| same | differs | update (safe, user did not edit) |
| differs | same | keep user's file (pack did not change it) |
| differs | differs, user == new | keep, record new base |
| differs | differs | conflict: show diff; Keep mine / Take theirs (mine saved to `.stm-mine`) / write theirs as `<file>.pack-new` |
| file missing on disk | any | user deleted it: do not recreate; ask |
| absent in base | present in new | add (conflict if a non-pack file already there) |
| present in base | absent in new | remove if user == base, else keep and report |

Rules block follows the same table on `rulesSha256`. Nothing is ever overwritten silently.

Rollback = update to `previous` from the store using the same three-way logic. Two versions are kept
(current and previous); older ones are pruned.

Remove plan: delete only files listed in state whose current hash equals the recorded hash; edited ones
are listed and kept unless the user ticks them; remove the CLAUDE.md marker block (if edited, show it
and ask); drop MCP entries we wrote; remove empty folders we created; drop the state record. Never
touches anything not in state.

## 8. Eval flow

1. From a pack's page: Eval. User writes a task prompt (or picks one of the pack's `examples`, if
   a later schema adds them), picks model and a turn cap (default 30).
2. Main creates two worktrees from the panel's repo with `createWorktree` (labels `pack-eval-with`,
   `pack-eval-without`). Requires a git repo; otherwise Eval is disabled with the reason.
3. In "with", the pack is installed into the worktree (normal plan, no review re-prompt since the same
   manifest was already allowed; its MCP enabled for that worktree only, with the same host notice).
4. Both panels start with the same prompt, model and settings, through the existing fan-out path.
5. On finish, collect per panel: final text, turns, input/output/cache tokens, cost, wall time,
   `worktreeStat` diff counts, optional test run (`testCmdOf`).
6. `comparePackEval(with, without)` (pure) produces deltas and a one-line verdict
   (cheaper/faster/same result), flags when either run failed or hit the cap, and never declares a
   winner from one run with deltas under 10 percent ("too close to call").
7. Side-by-side screen; buttons Keep pack, Remove pack, Discard worktrees (`dropWorktree`).

## 9. UI screens

All in one lazy chunk `app/src/Packs.tsx` (plus `PackReview.tsx`, `PackEval.tsx` imported only from it),
opened from the Catalog. Startup bundle unchanged; check with `startup-size.mjs`. App controls only
(`app/src/ui/controls.tsx`, Section, Select, Checkbox, `data-tip`); no emoji.

- Catalog: tabs Built-in, Mine, Shipped skills; row = name, version, installed state per project,
  "uses network" mark when `hosts` is non-empty. Add folder; Add from git URL (shows host, Fetch button).
- Review (before install and before each update): sections Files (target path per file),
  MCP servers (full command line `command args...` or URL), Network hosts, Credentials/env vars
  (name, why, secret yes/no, whether the vault has it), Rules text (verbatim). Scope choice
  (this project / global). Buttons Allow and Cancel. Allow is disabled while any validation error shows.
- Installed: per project; version, previous, Update, Roll back, Remove; per MCP server a switch
  "On for this project" which, when turned on, repeats the hosts and the full command line.
- Conflicts: per file Keep mine / Take theirs / Save theirs beside, with a text diff.
- Eval: setup form and the side-by-side result.

## 10. IPC channels

All `ipcMain.handle`, all added to `CONTRACT` in `app/shared/ipccontract.ts`.

| Channel | Args | Returns |
|---|---|---|
| `packs:list` | `[]` | catalog entries + validation status |
| `packs:addFolder` | `[path]` | entry or errors |
| `packs:fetchGit` | `[httpsUrl]` | entry or errors (network, user click only) |
| `packs:review` | `[packId, version, scope, root]` | manifest view + install plan + conflicts |
| `packs:install` | `[packId, version, scope, root, decisions]` | result |
| `packs:planUpdate` | `[packId, toVersion, root]` | three-way decisions |
| `packs:update` | `[packId, toVersion, root, decisions]` | result |
| `packs:rollback` | `[packId, root]` | result |
| `packs:planRemove` | `[packId, root]` | remove plan |
| `packs:remove` | `[packId, root, keepEdited: boolean]` | result |
| `packs:setMcp` | `[packId, root, server, on: boolean]` | state |
| `packs:installed` | `[root]` | installs for that root |
| `packs:evalStart` | `[packId, root, prompt, model, maxTurns]` | eval id + two panel ids |
| `packs:evalResult` | `[evalId]` | comparison |
| `packs:evalDiscard` | `[evalId]` | ok |

`root` must be a folder of an open panel or `~/.claude` (checked in main, not only by zod).

## 11. Network

docs/NETWORK.md gets a "Packs" section (row in "Only after you turn it on or ask"): hosts come from
each pack's manifest and are shown on the review screen and again before enabling a server; a pack's MCP
is off until enabled per project; Add from git URL contacts that git host, only after a click. No
request is made on browsing the catalog, reviewing, installing or removing.

## 12. Security

- Pack contents are untrusted. No script, hook or binary from a pack runs at install, update or remove.
- MCP servers start only when enabled for a project, with the full command line shown at that moment.
- Env values come from the vault and are passed only to the server that declared them.
- Rules text is shown verbatim and marked as from the pack; a rules block that looks like an
  instruction to bypass permissions is flagged (reuse `cmdrisk.ts`-style heuristics), not blocked.
- Paths and symlinks as in section 4; git clone with hooks, symlinks and submodules off.
- Size caps on all files and the manifest (64 KB).

## 13. Risks

- Prompt injection through skills and rules: mitigated by review and verbatim display, not solved.
- `npx`/`uvx` servers pull code at start time; pin versions in examples and warn on unpinned
  (`@latest` or no version) packages.
- Users editing CLAUDE.md markers can break the rules block: treat missing markers as user-removed.
- Eval cost: two full runs; show an estimate and require a click.
- Eval noise: one run per side is weak evidence; the verdict says so.
- Global installs affect every Claude Code use on the machine, also outside the app; the review says so.

## 14. Tasks

Pre-check done with `ls app/shared`: none of `packmanifest`, `packpath`, `packplan`, `packmerge`,
`packremove`, `packeval` exist (only the unrelated `packaged.ts`).

### Wave 1: pure logic in app/shared (vitest). Must not touch app/electron, app/src, docs.

- T1 Manifest. Create `app/shared/packmanifest.ts`, `packmanifest.test.ts`: zod schema, `parseManifest`
  returning `{ ok, manifest } | { ok: false, errors[] }`, cross-field checks (env, hosts, npx registry).
  Done: tests cover valid example, unknown key, bad id, undeclared host/env, http URL, bad command.
- T2 Path safety. Create `app/shared/packpath.ts`, `packpath.test.ts`: `safeRel(p)`, `inside(root, p)`,
  `allowedTarget(packId, to)`, `rejectSymlinks(lstatMap)`. Done: absolute, `..`, `~`, backslash, NUL,
  symlink, CLAUDE.md target all rejected.
- T3 Install plan. Create `app/shared/packplan.ts`, `packplan.test.ts`: `planInstall`, CLAUDE.md marker
  upsert `rulesUpsert(text, id, version, rules)`. Done: ops order, conflict detection, idempotent upsert.
- T4 Three-way decision. Create `app/shared/packmerge.ts`, `packmerge.test.ts`: `decide(base, user, next)`
  and `planUpdate`. Done: every row of the table in section 7 has a test.
- T5 Uninstall plan. Create `app/shared/packremove.ts`, `packremove.test.ts`. Done: edited files kept,
  foreign files never listed, marker removal, empty-dir list.
- T6 Eval comparison. Create `app/shared/packeval.ts`, `packeval.test.ts`, reusing `Attempt` from
  `fanout.ts` (read-only, do not edit it). Done: deltas, failure flags, "too close to call".
- T7 State file. Create `app/shared/packstate.ts`, `packstate.test.ts`: zod schema, migrate-or-readonly.
  Done: round trip, unknown schema read-only.

### Wave 2: main process and IPC. Must not touch app/src or Wave 1 logic (bug fixes go back to Wave 1 owner).

- T8 Store and sources. Create `app/electron/packs.ts` (+ test): store layout, add folder (copy, lstat
  walk), git fetch with safe flags, built-in and shipped-skill entries, atomic state writes.
  Done: test installs a fixture pack into a temp dir and removes it leaving the dir byte-identical.
- T9 IPC. Edit `app/shared/ipccontract.ts` (add `packs:*`), `app/electron/main.ts` (handlers),
  `app/electron/preload.cjs` (bridge). Done: contract tests refuse bad args; root check enforced.
- T10 Session MCP injection. Edit `app/electron/main.ts` (mcpServers assembly) and `app/electron/registry.ts`
  (origin "pack"). Do not edit `session.ts` or `guide.ts`. Done: disabled pack adds no server; enabled
  adds `pack-<id>-<name>` with vault env; never overrides built-ins.
- T11 Eval wiring. Edit `app/electron/main.ts` only, using `worktree.ts` and the fan-out path unchanged.
  Done: two worktrees, pack in one, usage collected, discard drops both.

### Wave 3: UI and docs. Must not touch app/electron or app/shared logic.

- T12 Screens. Create `app/src/Packs.tsx`, `PackReview.tsx`, `PackEval.tsx`; edit `app/src/Catalog.tsx`
  to lazy-open Packs. Done: `startup-size.mjs` passes at 215 KB, `no-native-ui` passes, no emoji.
- T13 Docs. Edit `docs/NETWORK.md` (Packs section), `docs/ROADMAP.md` (tick items), manual section in
  `guide.ts` MANUAL only if MANUAL lives there (text only). Done: NETWORK lists git fetch and per-pack hosts.

## 15. Open questions (with recommendation)

1. JSON or YAML manifest? Recommend JSON: zod already in use, no extra parser in any bundle.
2. Default MCP target: per-session injection or `.mcp.json`? Recommend per-session injection; `.mcp.json`
   opt-in, because a written `.mcp.json` would start servers in any Claude Code outside the app.
3. Allow arbitrary stdio commands? Recommend allowlist plus in-pack paths; others need a typed
   confirmation on the review screen in a later version.
4. Global installs in v1? Recommend yes for skills and rules, but MCP enabling stays per project.
5. How many old versions to keep? Recommend one previous (rollback), prune the rest.
6. Signed packs? Recommend not in v1; show source (folder path or URL + commit) instead.
7. Should Eval run more than once per side? Recommend optional N (default 1, max 3) and show the spread.
8. Where do built-in packs come from? Recommend ship two small ones in `app/engines/packs/` and
   expose `app/engines/skills/*` as Shipped skills, rather than moving that folder.
