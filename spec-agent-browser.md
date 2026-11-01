# Spec: agent browser

Status: spec only, no implementation. Branch `claude/agent-browser`. All paths below are under `app/` unless noted.

## Goal

1. A browser the panel's agent can drive, shown beside the panel, built on Electron's own Chromium (`WebContentsView` plus `webContents.debugger`, the Chrome DevTools Protocol). No second browser is downloaded.
2. A small, fixed tool set: navigate, read the page as clean Markdown, list numbered interactive elements, click / type / select by number, scroll, screenshot, wait for load or selector, back / forward, tabs.
3. An isolated profile per panel, or per project when the person chooses, so the agent never sees personal cookies; the person can sign in once into that profile and the agent reuses it.
4. Every new host passes the Control policy gate (ask by default for unknown hosts, `allow` rules possible), every action lands in the audit log, page text is untrusted content, the person can take over at any moment, and downloads and uploads ask.

## Non-goals

- No bundled browser, no Playwright download, no Python runtime added for this feature. Python libraries are studied for ideas only.
- No evasion of bot protection: no stealth patches, no spoofed user agents, no fingerprint changes, no CAPTCHA solving, no curl-impersonate. If a site blocks or challenges, the agent stops and tells the person.
- No impersonation of the person or of other browsers. The user agent is Electron's default Chromium one, unmodified.
- No access to the person's Chrome or Safari profiles, cookies, passwords or extensions.
- No network unless the feature is turned on, and then only to hosts the gate allowed.
- No headless background crawling at scale; `web/reader.ts` (Crawl4AI engine) stays the tool for that.
- No coordinate-based vision clicking in the first version (screenshot is for the person and for checking, not the main action channel).

## Where it sits today (checked on origin/main)

- `shared/panelbrowser.ts`: per-panel partition `persist:panel-<id>` and a Playwright profile folder `userData/panel-browsers/<id>`; `withProfile` points the optional Playwright MCP at it.
- `electron/integrations.ts:175`: optional Playwright MCP (`npx @playwright/mcp`), which runs its own browser outside the app's view and outside the policy gate's host checks.
- `electron/main.ts:805` `isBrowse`, `watchFailures` (failed requests to `browse:net`), `will-attach-webview` at `main.ts:1230` locks webviews by partition; `browse:clear` (`main.ts:2733`) wipes a panel's browser.
- `src/PreviewView.tsx`, `src/WebApps.tsx`: `<webview>` for a dev server preview and the drawer's web apps; a person drives them, the agent cannot.
- `electron/web/reader.ts`: the web reader MCP (`readPage`, `crawl`, `extract`, `web:extract` IPC) running Crawl4AI from a local Python venv (`engines/web`), with `shared/leanfetch.ts` (chunk, cache, schemas, crawl stop rules).
- `electron/docs.ts`: Office and PDF to Markdown (pdftotext, MarkItDown, pandoc).
- Control: `shared/policyrules.ts`, `shared/policygate.ts` (`host` field already in the grammar), `electron/policy.ts`, `electron/audit.ts`, `shared/auditlog.ts`, `shared/auditredact.ts`.
- Untrusted content: `shared/mentions.ts` fences untrusted text; spec-pilot (branch `claude/pilot`) adds a per-turn taint flag (`shared/pilottier.ts taintedAfter`).
- Startup budget: `scripts/startup-size.mjs --max-js-kb 215`.

## Research (read only, ideas in our own words)

| Source | License | What it does | Idea we take |
|---|---|---|---|
| OpenBot (`nightly-labs/openbot`) | PolyForm Noncommercial 1.0.0 (ideas only, no code may be copied into a commercial product) | Electron desktop app for persistent agents (Codex, Claude Code, Gemini, Cursor and others). Embedded browser: sandboxed `WebContentsView` tabs driven over CDP in the main process, tool namespace `openbot_browser` (open, navigate, snapshot, click, type, fill_fields, select_option, scroll, press, hover, drag, wait_for, screenshot, upload_files, evaluate, run_script, list/close tabs, request_takeover, submit_secret, fill_card, recording). Snapshots carry a revision; actions name a tab and a snapshot revision, stale targets fail. `run_script` batches many steps and returns one final snapshot to save turns. Profiles: shared partition, one per agent, or named profiles several agents share. Popups adopted as tabs. Secrets never pass as tool arguments: a secure card asks the person, the host blocks capture/recording/evaluation while a secret is in the page, then clears it. Takeover for CAPTCHA, passkeys, OAuth choice, 3-D Secure. Autonomy: agents run with full local access and no per-action approval after a first-launch consent; the README says this is not a security boundary. Multi-agent: channels with a lead, a no-tools router session picks members, each member gets its own task and execution thread. It strips the `Electron` token from the user agent and adds matching client hints. | Snapshot revisions and tab ids on every action; a batched `run_script`-style call; secret handoff outside the model; takeover reasons as a fixed enum; named profiles shareable by several panels. Not taken: full autonomy without a gate, page `evaluate` by the model, user agent changes. |
| CopilotKit/openbot (a different project, MIT) | MIT | Container per bot with Playwright Chromium; a gateway resolves the element, checks policy and audits before each action; challenge detection hands to the person; secret fields masked in snapshots. | Decide on the resolved element, not model labels; challenge stop; secret masking. |
| browser-use | MIT | Python, CDP. DOM plus accessibility tree, filtered by visibility, bounding box and paint order, interactive elements numbered `[n]`; action models (navigate, click by index, input, select, scroll, tabs, send keys, upload, done). | Numbered elements from a DOM snapshot; drop occluded/zero-size nodes; mark new elements since the last step; strict action schemas. |
| crawl4ai | Apache-2.0 | HTML to Markdown, pruning filter (text density, link density, tag weights, threshold), BM25 filter by query, links turned into numbered citations. Already used by our web reader. | Port the pruning score and citation links to TypeScript for in-page reads; keep the Python engine only for the reader. |
| markitdown | MIT | Many file types to Markdown (docx, pptx, xlsx, pdf, html, epub, rss, zip). Our `docs.ts` already uses it for Office. | Nothing new for pages; downloads go to `docs.ts` after the person accepts. |
| crawlee | Apache-2.0 | Node crawler, request queues, autoscaled pools, session pools. | Not reused: its strengths are scale and session rotation, which this feature does not want. |

Excluded by policy: curl-impersonate, stealth plugins, fingerprint spoofing.

### Comparison

| Capability | OpenBot / libs | SuperTokenMan today | This spec |
|---|---|---|---|
| Engine | Electron `WebContentsView` + CDP (nightly OpenBot), CDP (browser-use) | Playwright MCP via npx (own browser), Crawl4AI headless via Python | Electron's Chromium, CDP through `webContents.debugger`; nothing downloaded |
| Visible to the person | Tabs in the app window, live view (nightly OpenBot) | Webviews the person drives; Playwright window separate | `WebContentsView` beside the panel, same pixels the agent acts on |
| Element indexing | Numbered elements (browser-use), refs bound to a snapshot revision (nightly OpenBot) | None in-app | Numbered list from a DOM + AX snapshot, pure function tested in vitest |
| Page to Markdown | Pruning/BM25 + citations (crawl4ai) | Crawl4AI via Python for `readPage` | TS cleaner in `shared/`, citations, token cap; no Python needed |
| Policy per host | None, full autonomy after first consent (nightly OpenBot); gateway per action (CopilotKit project) | Policy gate has `host` field; Playwright MCP bypasses it | Every navigation and redirect to a new host goes through the gate |
| Audit | Row per action | Audit log for tool calls | Row per browser action, redacted |
| Take over | `request_takeover` with fixed reasons (nightly OpenBot) | n/a | Take over button pauses the agent; typed text while held is hidden from it |
| Bot challenges | Hands to person | n/a | Detect and stop, never solve |
| Secrets | Secure card fills outside the model, capture blocked, fields cleared (nightly OpenBot) | Vault redaction | Password and marked fields masked in list, Markdown and screenshot |
| Isolation | Partition shared, per agent or named profile (nightly OpenBot) | Partition per panel/persona | Partition per panel or per project; no container (we do better on weight, worse on OS isolation) |
| Batching | `run_script`: many steps, one final snapshot (nightly OpenBot) | none | `browser_steps`: up to 10 validated actions, one final element list |
| Where we do better | | | Same engine as nightly OpenBot, but every navigation gated, every action audited, page text tainted, no model-run page JavaScript |

### Viability

- Electron CDP: `webContents.debugger.attach('1.3')` gives DOM, DOMSnapshot, Accessibility, Input, Page, Runtime, Network. Limits: one debugger client per webContents (DevTools open by the person detaches it; handle `detach` and re-attach), no Browser/Target domain for new windows, so tabs are our own views (`setWindowOpenHandler` turns popups into tabs). `Input.dispatchMouseEvent` produces trusted events.
- macOS: `WebContentsView` is the supported replacement of `BrowserView` (Electron 30+); it sits in the main window's content view, so layout comes from the renderer via IPC bounds. Retina screenshots via `Page.captureScreenshot` at device scale; downscale to 1280 px wide before giving them to the model. Downloads go through `session.on('will-download')`; uploads through `DOM.setFileInputFiles` only after a file dialog the person confirms.
- Memory: a view is one renderer process, about 80 to 200 MB per busy tab. Cap: 3 tabs per panel, 6 views app-wide, idle views discarded after 10 minutes (URL kept, reload on next use).
- Cost per step: an element list of 200 entries is about 3 to 5 k tokens; a cleaned page capped at 6 k tokens; a screenshot about 1.5 k tokens at 1280x800. A 20-step task stays under roughly 150 k input tokens; step budget defaults to 30 per task.
- Startup: main-process code only; the UI pane is a lazy chunk, so the 215 KB budget is untouched.

## Design

### 1. Views and profiles

- `electron/agentbrowser/views.ts` owns a `Map<panelId, Tab[]>` of `WebContentsView`s. Partition: `persist:panel-<id>` (existing) or `persist:browse-<project-hash>` when the person picks "share with project". Never `defaultSession`.
- Each view: `sandbox: true`, `contextIsolation: true`, no preload, no node, `webSecurity` on, permissions (camera, mic, geolocation, notifications, clipboard read) denied by `setPermissionRequestHandler`.
- Sign-in: the person clicks "Sign in here" and drives the view; the agent is paused while they do.

### 2. Host gate

- Every `will-navigate`, `will-redirect` and request for a main frame calls `hostDecision(host, rules, seen)` (pure, `shared/browserhost.ts`). Result `allow | ask | deny`; `ask` pauses the action and shows a card "Open example.com?" (once / always for this profile / deny). "Always" writes an `allow browse when host is "example.com"` rule through the existing policy file writer.
- Subresources from other hosts are allowed (pages need CDNs) but logged in `browse:net`; navigations are what the gate controls.
- Local and private addresses (127.0.0.1, 10/8, 192.168/16, `.local`, `file:`) are denied unless the panel is a Preview panel.

### 3. Actions and schema

Tool names under the `stm` MCP server, `mcp__stm__browser_*`: `open`, `steps` (up to 10 actions validated one by one, one final element list), `takeover` (reason from a fixed list: sign-in, captcha, passkey, payment, unclear), `read`, `elements`, `click`, `type`, `select`, `scroll`, `screenshot`, `wait`, `back`, `forward`, `tab_new`, `tab_switch`, `tab_close`, `done`. Each input validated by `shared/browseraction.ts` (zod-free pure validator to keep it in `shared/`). Index references point to the latest element list; every element list has a revision and every action names it with the tab id; a stale revision fails with "call elements again". No `evaluate` tool: the model never runs page JavaScript.

### 4. Element list

`Page` snapshot via `DOMSnapshot.captureSnapshot` plus `Accessibility.getFullAXTree`, sent as JSON to `shared/browserindex.ts`: keep visible, non-zero-box, not occluded (top element at the box centre is the node or its descendant), interactive (role or tag or handler); number them in reading order; output `[n] role "name" value?` lines, max 200, new since last list marked `*`. Password inputs and fields marked secret show `value: [hidden]`.

### 5. Page to Markdown

`shared/pagemd.ts`: input is the snapshot's text nodes with tag path and box; drops nav/footer/aside/hidden, scores blocks by text density and link density (pruning idea), keeps headings, lists, tables, code; links become `[text][n]` with a reference list; capped at 6 k tokens with "more: call read with page=2". Output is wrapped as untrusted (`<untrusted source="https://host">...`), and the turn is marked tainted (spec-pilot rule: ask never resolves to allow in a tainted turn).

### 6. Take over, downloads, uploads, challenges

- Take over: a button on the pane; sets `held`, the next agent action returns "the person has the browser". Text the person types while holding is masked in later element lists.
- Secrets: the model never receives or passes a secret. A password or code field triggers a card where the person types it (or picks a vault item); while it sits in the page, screenshots, element values and recording are blocked, and the field is cleared after submit.
- Downloads: `will-download` is paused and shown as a card (name, size, host); accept saves to the panel folder `.stm/downloads/`; Office/PDF then may pass through `docs.ts`.
- Uploads: `browser_upload` only accepts a path inside the project and always asks.
- Challenges: `shared/browserchallenge.ts` classifies HTTP 403/429, `cf-mitigated` header, and visible "verify you are human" text; the agent action returns `blocked` with the reason and stops the task. The tool never retries with changed headers.

### 7. Budget

`shared/browserbudget.ts`: steps per task (default 30), wall time (10 min), screenshots (10), new hosts (5). Exceeding any ends the task with a summary for the person.

## IPC

| Channel | Direction | Payload |
|---|---|---|
| `abrowser:bounds` | renderer to main | `{ panel, rect }` where the pane sits; `null` hides |
| `abrowser:state` | main to renderer | `{ panel, tabs[{id,url,title,loading}], active, held, step, budget }` |
| `abrowser:take` / `abrowser:release` | renderer to main | `{ panel }` |
| `abrowser:ask` | main to renderer | host, download or upload card `{ id, kind, detail }` |
| `abrowser:answer` | renderer to main | `{ id, answer: 'once' \| 'always' \| 'deny' }` |
| `abrowser:profile` | renderer to main | `{ panel, scope: 'panel' \| 'project' }`, `abrowser:clear` reuses `browse:clear` |
| `abrowser:enabled` | both | feature switch, default off |

All added to `shared/ipccontract.ts` and `preload.cjs`.

## UI

- `src/AgentBrowser.tsx` (lazy, `React.lazy`), a pane beside the panel with tab strip, URL (read only while the agent drives), step counter and budget, "Take over" / "Give back", "Sign in here", "Clear profile".
- Cards for host, download, upload asks reuse `src/ui/dialog.tsx` and `src/ui/controls.tsx`. Element highlight: a 2 px outline drawn by CDP `Overlay.highlightNode` on the element acted on, colour from BRAND.md tokens.
- Settings: Security & Privacy gets an "Agent browser" switch (off), profile scope, budgets.
- Look per BRAND.md: existing tokens in `src/ui/ui.css`, no new fonts, no new icon set.

## Docs

- `docs/NETWORK.md`: new row "The sites the agent opens | the hosts you allowed, from the panel's own browser profile | only when the Agent browser is on and a panel opens a page".
- Manual entry in `shared/manual.ts` (keys: browser, agent browser, take over, sign in).

## Risks

- Prompt injection from pages: mitigated by untrusted fencing, taint, the host gate and asks on downloads, uploads and new hosts; not eliminated.
- Session theft: a profile with sign-ins is valuable; it lives under userData like today's partitions, cleared by `browse:clear`.
- CDP detach when the person opens DevTools: actions fail cleanly and re-attach.
- Sites change markup between list and click: index staleness check plus re-resolve by role and name before acting (OpenBot idea).
- Memory on 8 GB Macs: tab caps and idle discard.
- Overlap with Playwright MCP: kept as is; the docs say the agent browser is the gated one.

## Tasks

Wave 1: pure logic in `shared/` with vitest.

| # | Task | Files | Must not touch | Done when |
|---|---|---|---|---|
| W1.1 | Element indexing from a DOM + AX snapshot JSON | `shared/browserindex.ts`, `.test.ts`, fixtures `shared/fixtures/snap-*.json` | other shared files | visible/occluded/zero-box filtered, reading order, max 200, new marked, password hidden; tests on 3 fixtures |
| W1.2 | Page Markdown cleaner | `shared/pagemd.ts`, `.test.ts` | `shared/leanfetch.ts` | boilerplate dropped, tables and code kept, citations, page cap, untrusted wrapper |
| W1.3 | Action schema validation | `shared/browseraction.ts`, `.test.ts` | `shared/ipccontract.ts` | each tool's input validated, stale index rejected, unknown fields rejected |
| W1.4 | Host policy helpers | `shared/browserhost.ts`, `.test.ts` | `shared/policygate.ts`, `shared/policyrules.ts` | host normalisation (IDN, ports, www), private ranges denied, rule match via exported gate types, "always" rule text |
| W1.5 | Step budget and challenge classifier | `shared/browserbudget.ts`, `shared/browserchallenge.ts`, tests | other shared files | limits end the task with reason; 403/429/cf-mitigated/visible text classified, no retry path exists |

Wave 2: main process, IPC, MCP tools.

| # | Task | Files | Must not touch | Done when |
|---|---|---|---|---|
| W2.1 | Views, tabs, profiles, permissions | `electron/agentbrowser/views.ts` | `electron/main.ts` webview code | views per panel, popups become tabs, caps and idle discard, permissions denied |
| W2.2 | CDP driver | `electron/agentbrowser/cdp.ts` | views.ts | attach/detach, snapshot, input events, screenshot, wait, overlay highlight; re-attach on detach |
| W2.3 | Gate, audit, downloads, uploads | `electron/agentbrowser/guard.ts` | `electron/policy.ts`, `electron/audit.ts` (import only) | each navigation/redirect gated, each action audited redacted, download and upload asks |
| W2.4 | MCP tools | `electron/agentbrowser/tools.ts` | `electron/uitools.ts` | `mcp__stm__browser_*` registered when enabled, results fenced untrusted, taint set |
| W2.5 | IPC and wiring | `shared/ipccontract.ts`, `.test.ts`, `electron/preload.cjs`, `electron/main.ts` (handlers only) | other channels | contract test covers `abrowser:*`; feature off means no view and no tools |

Wave 3: UI and docs.

| # | Task | Files | Must not touch | Done when |
|---|---|---|---|---|
| W3.1 | Browser pane | `src/AgentBrowser.tsx`, `src/agentBrowser.css` | `src/ui/*` | lazy chunk, bounds sent, take over works, startup-size passes 215 KB |
| W3.2 | Ask cards and settings | `src/AgentBrowserAsk.tsx`, `src/settings/AgentBrowserSettings.tsx` | `src/ui/dialog.tsx` internals | host/download/upload cards, switch, scope, budgets |
| W3.3 | Docs | `docs/NETWORK.md`, `shared/manual.ts` | other docs | NETWORK row added, netwatch allowed list unchanged with feature off, manual entry |

Counts: wave 1: 5, wave 2: 5, wave 3: 3.

## Open questions

- Profile default: per panel (safer) or per project (fewer sign-ins)?
- Should the Playwright MCP integration be hidden when the agent browser is on, to keep one gated path?
- Is an `ask` for each new host too noisy for research tasks; allow a per-task host list confirmed once?
- Screenshots to the model by default, or only on request (cost versus accuracy)?
- Named profiles shared by several panels (as nightly OpenBot), or only panel and project scope?
- Should `browser_read` share the reader's cache and learned schemas in `web/reader.ts`?
- Taint scope (shared with spec-pilot): per turn or per session after the first page read?
