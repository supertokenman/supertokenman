# SuperTokenMan: brand and design

The app's visual system, in one place. Anything that changes how the app looks is written here in the
same commit. Code is the source of truth for values; this file says what each piece is for and the rules
around it.

## See it live

In the app: Cmd+K, **Design system**. It renders the real components in the current theme: every colour token with its value, the type faces, buttons in every kind and state, fields, all icons (with the moving ones marked and a switch to play their motion), state marks, notices and chips. It reads `icons.tsx` directly, so a new icon shows up there on its own. Screenshots of both themes: `docs/design/`.

## Direction

Constructivist and Swiss: flat colour, hard edges, a grid, uppercase mono labels, one warm accent. The
signature is the **45 degree cut corner** at the top right of anything you can act on or that frames
content. No rounded pills for actions, no drop shadows for depth, no emoji in the UI.

## Positioning and the public face (decided 2026-10-25)

Decisions for the rebrand and the institutional site. Each one was chosen over named alternatives;
the reason is next to it.

**Who it is for.** The solo developer who uses Claude Code every day. Small teams that one person can
follow closely are welcome, but the site only shows what the app already does for them (budgets and
tasks across panels, playbooks, approvals); no SSO, admin console or seat pricing is promised.

**Promise.** "Your whole dev day in one window." "In plain sight" (the About line) can be a subtitle.
Because the promise is broad, the home must prove it with real screens right below it.

**Name.** SuperTokenMan stays: no change to the bundle id, `supertokenman://`, the domain or the
SuperToken Display face. The softer visual system carries the move away from the arcade look.

**Mascot.** Becomes an easter egg: gone from the home and the main UI, allowed in hidden places (404,
the changelog footer, a secret shortcut).

**Accent.** The current `#c65d3b` / `#d97757` stays. Because it sits close to Anthropic's palette and
the app runs Claude Code, every public page carries "Not affiliated with Anthropic." in the footer.

**Theme names.** Users see "Paper" and "Ink" instead of "Claude Paper" and "Claude Dark"; the internal
ids (`claude-paper`, `claude-dark`) stay for now, so saved settings need no migration.

**System on the site.** Soft on top, Swiss underneath: white and airy like the splash film, large type,
the grid, mono for numbers and labels, one accent. The 45 degree cut corner is used sparingly (download
button, screenshot frames, icon); the three bars are the quiet signature (loader, divider, favicon);
uppercase only on small labels.

**Type on the site.** The app's trio, with the display face kept small: SuperToken Display only for the
name (header, footer) and large numbers; titles in the system sans, semibold with tight tracking, like
the splash film; system sans for running text; mono for labels. Changed on 2026-10-26 from "Display for
large titles": the all-caps face read heavy and tool-like on a white page. The only web font served is
our own.

**Voice.** Titles are calm and short ("Agents. Memory. Your tools. One window."); the text under them
is dry and technical: verb first, numbers where we have them, no marketing adjectives, nothing we
cannot back. What is not verified is said to be not verified.

### Site

- Domain: `supertokenman.com` is primary; `supertokenman.com.br` redirects to it. Hosted on Cloudflare
  Pages. The app still sends `supertokenman.com.br` as the referrer for YouTube embeds
  (`app/electron/mini.ts`); move it to `.com` with the domain change.
- Pages at launch: Home, Download, Security & Privacy, Changelog, Docs.
- Home: three large pillars (Agents, Control, Memory), each with a title, a paragraph and a real
  screen; then a compact "And everything else" grid (your tools, your day) with one line each; then a
  "For small teams" section.
- Media: a 20 to 30 s silent looping film at the top in the style of the splash, and real light-theme
  screenshots in the pillars. Screens come from the running app with plausible sample data; no mockups
  of features that do not exist.
- Security & Privacy: a scoped claim ("No telemetry. Nothing leaves your Mac except the calls you turn
  on, and the update check.") backed by a table of what talks to the network and when, with a "Last
  reviewed" date. Needs a real audit of outbound calls first (a grep on 2026-10-25 found no telemetry
  of our own; that is not an audit) and a test that fails if hidden telemetry is added.
- Docs are Markdown in `site/docs/`, built into `/docs`; the Changelog page is built from the release
  notes of the public repo. The site gains a small build step for this.

### Download

- Mac only at launch (arm64 and Intel). Linux may follow; Windows needs its own signing.
- Signed with Developer ID and notarized (account exists). The first signed build still has to be run
  and checked with `verify:mac` on a Mac; until then, "notarized" is not claimed.
- Source is public (decided 2026-10-26), under FSL-1.1-ALv2 (`LICENSE.md`, copyright Yuji Miguel
  Arima): anyone may read, audit, build and change it; only a competing commercial product is excluded,
  and each version becomes Apache 2.0 two years after release. Reason: the security claims have to be
  checkable by people outside, not taken on our word.
- The public repo `supertokenman/supertokenman` starts with a fresh history: one commit of the tree as
  of 0.1.3, without `research_notes/`, `reports/` and `site/index.old.html`. `arimayuji/CLI` stays
  private with the full history. Releases (dmg, zip, `SHA256SUMS`, `latest-mac.yml`) stay in the public
  repo. Signing secrets go only into its Actions secrets, which pull requests from forks never see.
- Development moved to the public repo on 2026-10-26: pull requests, CI (`.github/workflows/ci.yml`:
  tests, gitleaks, OSV-Scanner, Semgrep and the network check on every pull request) and releases all
  happen in `supertokenman/supertokenman`. `arimayuji/CLI` is archived, its secrets deleted and its
  Actions off; the sync script is gone.
- Money, for now (decided 2026-10-26): the app is free; GitHub Sponsors on the personal account `arimayuji` (no company yet; moves to the org once there is one)
  (`.github/FUNDING.yml`, site page `/support/`). Company sponsors get a logo on the site and README only.
  Never ads, sponsored suggestions or data inside the app. A paid plan for teams may come later; the app
  for one person stays free.
- Other agents (decided 2026-10-26): Claude Code only at launch. OpenAI Codex goes on the roadmap as a
  second engine for panels once users ask for it in Issues; first an engine layer in the code with
  Claude as engine one, then Codex with the basics (run, approve, cost), then side-by-side comparison.
  Reason: it lowers the platform risk of depending on one vendor, but it waits until after launch.
- Auto-update: checks the public releases on launch and periodically, shows "Update available" with
  the notes, and installs only when the user agrees. The automatic check can be turned off in
  Settings; the privacy page lists it.

## Colour

Tokens live on `:root` in `app/src/app.css`; each theme (`claude-dark`, `claude-paper` and the others in
Appearance) redefines the same names. Components only use tokens, never literal colours.

| Token | Use |
|---|---|
| `--bg`, `--surface`, `--raised`, `--sunken` | page, panel, controls, fields and terminal |
| `--hover` | hover fill |
| `--border`, `--border-strong` | hairlines; `--border-strong` for controls |
| `--text`, `--muted`, `--faint` | ink, secondary ink, hints |
| `--accent` (`#d97757` dark), `--accent-hover`, `--deep`, `--on-accent` | the one accent, its hover, its darker ink, text on it |
| `--green`, `--red`, `--gold`, `--blue` | state only: pass, fail or danger, warning, info |
| `--s0`..`--s5` | chart series, fixed order, validated for colour blindness (phase 52) |

Rules: the accent marks the one thing to do or the thing that is current. Status colours always come with
a word or a shape, never colour alone. Text never takes a series colour.

## Type

- **SuperToken Display** (`app/src/fonts/supertoken-display.woff2`, our own face): titles, sheet heads,
  big numbers.
- **UI** (`--ui-font`): system sans for running text and controls.
- **Mono** (`--mono`): labels, numbers, code, paths. Labels are mono, 10.5px, uppercase, letter-spacing
  0.08em (`.fld-label`, table heads, `TIP`, `COPY MODE`).
- **Terminal**: JetBrainsMono Nerd Font Mono (OFL + Nerd Fonts licence, files next to the font).

## The cut corner

- `--notch: 9px` for fields and framed content, `--bnotch: 7px` for buttons (5px on `.small`).
- Drawn with `clip-path: polygon(0 0, calc(100% - n) 0, 100% n, 100% 100%, 0 100%)`.
- When the element has a border, the border along the cut is a `linear-gradient(225deg, …)` at
  `n * 0.7071`, so the line follows the diagonal instead of being cut off.
- A clip-path cuts outlines and outer shadows: focus is shown inside (an inset accent bar), never with
  `outline`.

## Buttons

| Kind | Look |
|---|---|
| default | raised fill, `--border-strong` line, cut corner |
| `.primary` | accent fill, `--on-accent` text, weight 600 |
| `.danger` | red fill; used for the second step of a destructive confirm |
| `.ghost` | no fill, no line; muted text; for toolbars |
| `.icon` | 24px square, no cut, for close and small tools |
| `.small` | 24px high, smaller notch |

States: hover lifts the fill and the line; pressed shows a 2px accent bar at the bottom; keyboard focus
shows a 3px accent bar on the left; disabled is 35% opacity. Destructive or outward actions are two
steps (the button, then a confirm in place), never a dialog.

Colours change through the custom properties `--btn-bg` and `--btn-line`; a component that restyles a
button sets those, not `background`, so the cut corner keeps its border.

## Fields

Inputs, selects and textareas in sheets (`.sheet.observe`): cut corner with the drawn border, a 3px
accent bar on focus, a select arrow made of gradients, labels above in the mono label style
(`.fld`, `.fld-label`, `.fld-help`, `.fld-grid`). A container with `.cutfields` gives the same field style outside an `.observe` sheet (Markets add field,
News add field, Database new connection). Monogram tiles (feeds, database engines) are drawn as cut squares
with two mono letters: our own marks, never a service's logo.

## Icons

`app/src/icons.tsx` is the only icon set: drawn for this app on a 16px grid, 1.5px stroke, round caps,
`currentColor`. Inline one-off SVGs are not added; a missing icon is drawn into the set.

Action icons have one small motion each, on hover of their button or when the action lands, and none
under `prefers-reduced-motion`:

| Icon | Motion |
|---|---|
| `IconSearch` | leans in |
| `IconCopy` | front sheet slides |
| `IconCheck` | the check draws itself (pathLength) |
| `IconMerge`, `IconDeploy`, `IconExternal`, `IconHistory` | the arrow or joint nudges in its direction; history turns back |
| `IconTest` | the liquid line turns green |

Brand marks for other services are in `IntegrationMark.tsx`, drawn as our own pictograms, never their
logos.

## State marks

`StateMark.tsx`: a state is a shape that moves the way the state feels, with the word kept for the
pointer and screen readers.

| State | Shape | Motion |
|---|---|---|
| up | circle | breathes a ring |
| busy | triangle | turns |
| warn | cut square | small sway |
| down | square | lands filled, with a jolt |
| off | dashed circle | still |

## Motion

`--ease: cubic-bezier(0.2, 0.7, 0.2, 1)`. Durations 80 to 320ms. Motion explains a change (arriving,
pressed, done); nothing loops unless something is running. Every animation stops under reduced motion.

## Charts

Our own SVG components in `app/src/Chart.tsx` (ECharts was removed). One look everywhere: Analytics,
Metrics, Ask your data, the design system.

- `Chart` (bar or line): bars square with the **45-degree cut** on the top-right corner (bottom-right for
  negative bars), at most 28px wide, 2px apart in a group; lines 2px with 5px square points up to 40
  points and a faint area under a single series. Mono axis labels, compact numbers (12k, 2.5M), a dashed
  grid, a solid zero line, round ticks, time ticks at calendar steps. Hover: a dashed crosshair (line) or a
  shaded column (bars), a diamond on the point, other bars dimmed, and a cut-corner tooltip with an accent
  bar listing every series. A legend with cut swatches from two series up. "Show table" always there.
- `Stat`: a headline number in the display face, mono label, change with up/down glyph, and a sparkline.
- `Sparkline`: no axes, the last point marked.
- `Meter`: 20 segments; series colour under 80%, gold from 80%, red at 100% and over, with the numbers.
- Rules: series colours `--s0..--s5` in fixed order (never by rank); one axis per chart (measures of very
  different size get a chart each); colour is never the only carrier (legend, tooltip, table).
- Motion: bars grow from the baseline staggered by 18ms, lines draw in 700ms; none under reduced motion.

## Terminal

Its sixteen colours are the brand's (warm on dark, printer's ink on paper), the cursor is the accent and
the frame has the cut corner. See `TermView.tsx`.

## Motion on the site (decided 2026-10-26)

The first motion pass was too quiet for a page that has to sell. Direction C: scroll-linked, built only
from the brand's own parts (the 45 degree cut, the three bars, the accent), no outside libraries.
- The headline rises word by word; the film starts within a second, at a faster pace, and comes in
  tilted, lying flat as the page scrolls.
- Agents, Control and Memory are one pinned story: the text scrolls, the screen stays and changes along
  the 45 degree line, and a three-bar rail fills as each part is read. On a phone the screen follows
  each part instead.
- The "everything else" grid fills in as a cascade; an accent reading bar runs along the top.
- Everything is off with prefers-reduced-motion.

## Panels as cards (decided 2026-10-26)

Panels used to touch, split by a 1px line. Now each panel is a card: 6px of space between them on the
sunken background, the brand's 45 degree cut at the top right (12px), and a 1px edge that follows the cut.
The focused panel's edge is the accent. Over a scene the space is transparent, so the scene shows
between the cards. Panels do not resize by hand yet, so there is no handle in the space.

## Changelog

- Phase 16: top-bar selects follow the button shape (cut corner, drawn border, accent bar on focus, mono uppercase label); the Modules sheet shows modules that are off at reduced opacity and the ones on with an accent top rule.

- Phase 51: ADR status as outlined mono tags (proposed gold, accepted green, rejected/deprecated red, superseded muted with the ADR that replaced it); capacity results as `Stat` tiles; the weekly exercise as a large line with an accent rule.

- Phase 34: backend map drawn in our style: services as cut-corner boxes (accent outline when picked, others dimmed), data stores as cylinders outlined in `--s1`, solid lines to stores, dashed accent arrows for dependencies; HTTP methods as outlined mono tags (GET green, POST blue, PUT/PATCH gold, DELETE red).

- Own charts: ECharts replaced by our SVG Chart, Stat, Sparkline and Meter; shown live in the Design system sheet.

- Phase 37: a single-number answer is a big accent figure in the display face with its column as a mono label; dashboard cards have a 2px accent top rule; two measures of very different size are never drawn on one axis.

- Phase 33: data grid edit states: a changed cell has an accent tint and left bar (the old value in its tooltip), a new row a green tint, a removed row a red tint and strike-through; PK columns carry a small outlined PK tag.

- Design system sheet: the live catalogue of the components above; animated icons can be played all at once.

- Phase 53: the One inbox takes the branded fields (`.sheet.observe`); outward replies to team chat are two-step, the second button names where it goes ("Approve: post in #dev"). Rocket.Chat's source tag uses `--s3`.

- Phase 60: the remote chip in a panel header is blue (`--blue`, info) with the small cut corner and `IconRemote`; the machine check lists results as mono label and value, green or red.

- Phase 59: issue labels as hairline tags in mono; the issue sheet reuses the Past sessions list and preview layout. Agent requests (`stm ask`) use the same approval card as tool calls.

- Phase 57: Skill drafts sheet uses the list and editor layout of Past sessions (accent bar on the picked row, mono names).

- Phase 54: terminal font and the find bar, copy-mode line and tip in the brand.
- Branded fields: cut corner and drawn border for inputs, selects, textareas; mono labels.
- Buttons and icons: buttons get the cut corner and the focus and pressed bars; 16 new icons with
  motion; the 65 hand-drawn close crosses replaced by `IconClose`.
- Phase 25: Connect other agents sheet; the config snippet sits in a plain mono block with the hairline border, no fill. Screenshots: `design/connect-agents-*.png`.
- Phase 9: `IconMic` and `IconSpeaker` (16px grid, 1.5 stroke). The dictate button is quiet until it records: then accent border, stop glyph and a slow accent ring pulse (off under reduced motion). Read sits with Good and Bad as a ghost small button. Screenshots: `design/voice-*.png`.
- Phase 18: an `App` chip (blue, info) on tools that bring their own page; the page sits in a frame with the hairline border and the big cut corner, under a mono `App` label with the `ui://` address. Its own styles are its own: we do not restyle a server's page. Screenshots: `design/mcp-app-*.png`.
- Phase 10: Phone companion. The pairing code is the one large number in the app: 32px mono, accent, split 3 and 3. The phone page carries the brand on its own (paper and ink tokens, light and dark by the phone's setting, cut-corner cards and buttons, mono uppercase title) with no outside files. Screenshots: `design/phone-*.png`.
- Opening and closing (replaces the arcade intro): a white product film, white in both themes on purpose. Two lines ("Every token." / "In plain sight.") rise out of a 14px blur, hold and lift away; then the name in the system sans (-0.03em tracking) settles over a 72px accent rule, with "Starting Claude Code" in small grey. The full film (about 3 s) plays once a day; later starts show only the name (0.9 s). Closing: the white comes back over the app with the name and the rule (320 ms; the main process waits at most 700 ms). Off with reduced motion or the palette toggle. Frames: `design/opening-film.png`.
- Sheets carry the opening's signature: the three 45-degree bars sweep across the top as a sheet opens (520 ms) and again as it closes (220 ms). Screenshot mid-sweep: `design/sheet-open-sweep.png`.
- Phase 65: Extract with sources. Grounded spans are marked in the source with a light accent wash; the picked one turns solid accent with paper text. Rejected rows stay in the table, dimmed, with the reason in red and the invented quote shown. Screenshots: `design/extract-*.png`.
- Phase 66: Sources bar above the composer. Each passage is a chip with a small cut corner, its mark (S1) in mono; a chip the answer cited gets the accent border and accent mark, uncited ones stay faint. Screenshots: `design/citations-*.png`.
- Phase 67: Message filters. The list is ordered rows with an on box and up/down; the picked row gets the accent border. Code and valves in mono boxes; a failed try shows in the error tone. Screenshots: `design/msg-filters-*.png`.
- Phase 68: Export session. A ghost small Export button by Remember; the sheet previews the exact text in a mono box, with turn range, a tools box and a Markdown/HTML segmented switch. The exported HTML page is white and quiet like the opening film (system sans, accent rule on quotes). Screenshots: `design/export-session-*.png`.
- Phase 69: Model router chip above the composer: a mono SUGGESTED label, the model in bold, the reason and the estimate in faint text, a ghost Switch and a dismiss cross. A left rule says which way the money goes: green when it saves, accent when it costs more. Screenshots: `design/model-route-*.png`.
- Phase 70: Playbooks. Each playbook and each run is a card with the big cut corner; steps carry small mono tags (the check command, and checkpoint in accent). A run shows its state as a mono uppercase word (green done, red failed, accent while running or waiting) over a 3px progress rule. Screenshots: `design/playbooks-*.png`.
- Fix: the sheets' bar sweep now runs past the right edge and fades, so it never stops inside a wide sheet.
- Phase 71: Faithfulness line under the sources: two percentages (green when good, accent when not), opening to the claims with a mono verdict word each (green supported, red weak or bad mark, grey uncited) and numbers missing from the source called out. Screenshots: `design/faithfulness-*.png`.
- Phase 72: Tasks across panels. The budget is the segmented Meter from the charts; alerts sit in the timeline in accent; the decision closes the task in a plain notice. Task rows are flat outlined buttons, the picked one in accent. Screenshots: `design/tasks-*.png`.
- Phase 73: Isolate chip in the panel header: quiet Isolate until on, then outlined green (no network) or accent (network on). Its popover is fixed to the window (a portal), with the cut corner. Screenshots: `design/isolate-*.png`.
- Phase 74: Routines. Routine cards like playbooks; drafts are rows with an unread dot, the open one in accent, its text rendered as Markdown in a hairline box. Fix: list rows built on buttons (tasks, drafts) now grow with their text. Screenshots: `design/routines-*.png`.
- Phase 75: Import a skill. A link field above the drafts; an imported draft opens with a hairline box: source link, license (accent when none), findings in red with a checkbox each to acknowledge, warnings in grey, and a red/green line diff against a skill already at that name. Screenshots: `design/skill-import-*.png`.
- Phase 78: Diagnostics. Each error is a one-line outlined row (level word in red, the source in mono, the first line, the time) that opens to the full masked text. Screenshots: `design/diagnostics-*.png`.
- Phase 79: native surfaces follow the system (menu bar, right-click menu, About panel with the line "Your Claude Code, in plain sight."). The dock badge is the system's own red count.
- Phase 82: a supertokenman:// link shows as a bar under the top bar with the big cut corner, accent border (red when refused), a mono LINK label, the question, and Open / Ignore. Screenshots: `design/deeplink-*.png`.
- Phase 84: the Context compactor is a source in Savings with its own validated colour (--sv-7: #7a7a10 light, #8f8f2a dark; palette checked with the dataviz validator) and four switches under the lean-tools switch.
- Phase 85: Memory items. Each item is an outlined row; a newer version carries an accent left rule; the origin is a mono uppercase word (green for you, accent for Claude, grey for a session); named things show as small code chips. Screenshots: `design/memory-items-*.png`.
- Phase 86: chunks carry a small mono tag (green "vector" when it has an embedding, grey "words only"); Split here and Join with next are ghost small buttons; the compiled artifact shows in a mono box under its version line. Screenshots: `design/documents-compiled-*.png`.
- Phase 87: "Trim tools" is a ghost chip beside Isolate, accent when tools are off ("Tools trimmed · N off"); its popover reuses the Isolate cut-corner sheet with the task field, the kept/total line and a mono list of tools left out. Screenshots: `design/trim-tools-*.png`.
- Phase 88: the Source chip sits first among the panel chips ("As set up", "Plan only", red "Paused · plan limit"), with a 34 px headroom bar (accent, amber from 80%, red at 100%). The popover lists the four sources as radios with one line each; a switch shows an accent-ruled confirm line (twice for a custom endpoint). Budget gets a Custom endpoint section, off by default. Screenshots: `design/source-confirm-*.png`, `design/trim-tools-*.png`.
- Phase 91: architecture templates as a grid of outlined cut-corner cards under "Or start from a template". In the diagram itself, boxes use draw.io card shapes (12 px cut), a mono role tag above the name, olive for queues, blue for caches, a dashed outline for outside services, cylinders for stores. Screenshots: `design/diagram-template*-*.png`.
- Phase 92: contrast fixes so every shipped theme meets the rules in `src/themeContrast.ts`: Claude Paper accent `#c15f3c` → `#ba5936` (white on it 4.6:1) and faint `#a19e95` → `#8c8980`; Claude Dark faint `#5f5d58` → `#676560`; Game Boy muted and faint, Midnight Ink faint lifted. The design system sheet has a Contrast table: a swatch with "Aa", the pair in mono, the use, ratio over the minimum, and an outlined mono grade (green when it passes, red "Under" when not). Screenshots: `design/contrast-*.png`.
- Phase 93: the Stop icon is now a filled square with the 45° cut corner on the 16 px grid. In the Design system sheet, an icon with lines off 45° gets a gold underline and a small mono count in its corner; hovering lists each line. Screenshots: `design/icon-check-*.png`.
- Phase 94: three brand moves in `motion.css`. Split-flap: each changed character of a number drops in from above, cut at its middle, rightmost first (`SplitFlap`, Savings totals). Rubber stamp: scale 1.9 and -9° down to -3°, like an inked stamp (`.stamp-in`, the trimmed-tools chip). Diagonal entry: cards slide in along 45° and are revealed by a diagonal cut, 45 ms apart (`.enter-diag` with `--i`). Under reduced motion all three only fade. Screenshots: `design/motion-diag-*.png` (taken at 8% speed).
- Phase 95: run_code shows as a normal permission card (code · run code); after it runs, a plain note gives the receipt: language, time, bytes printed against bytes sent to Claude, where the whole output was saved, and the code hash. Screenshots: `design/run-code-*.png`.
- Phase 96: the Snapshot card sits above the composer after a compact: surface sheet with a 3 px accent left rule and the 12 px cut corner, a mono label, the snapshot in an editable mono textarea, and "Do not hand this back". It goes away once the snapshot rides on a message. Screenshots: `design/snapshot-*.png` (the dark one has the theme set live, so the HUD keeps light art).
- Phase 97: the panel header gets a mono "28k–38k kept out" chip with a 3 px left rule in the Scripts colour; hover lists each layer. Savings has a new source, Scripts, with its own validated colour (--sv-8: #0a7d9c light, #2a95b0 dark; the eight-colour palette passes the dataviz validator on both surfaces). Screenshots: `design/meter-*.png`.
- Phase 98: a vault problem shows as an error note in the panel ("acme/vault-note.md in the vault: line 3: ..."), points joined with a middle dot. Skill drafts gets a ghost "Add vault format skills" button beside the import; imported drafts show their source and MIT license in the same box as other imports. Screenshots: `design/vault-check-*.png`, `design/vault-skills-*.png`.
- Phase 99: Office files is a sheet with a file list on the left (path in bold, panel and time below) and the checks on the right: an outlined mono VALID / INVALID / NOT BUILT tag, commands, time and hash, the issues as plain lines, the preview image framed on the sunken colour, and "Show in folder". Without OfficeCLI it shows only the instruction and the releases link as selectable mono text. Screenshots: `design/office-*.png`.
- Phase 100: no new surface; the Paid API line in the Source popover now says the panel gets a token through the local gateway, never the key. Screenshots: `design/gateway-*.png`.
- Phase 101: Publish images is a sheet of cut-corner image cards (preview at 4:3, checkbox with the path in mono, line and size below; a ticked card gets a 3 px accent left rule; a missing file is dimmed). Nothing is ticked at first. Publishing asks once more on the same row with an accent-ruled line giving the count and size. Screenshots: `design/md-images-*.png`.
- Phase 102: Design handoff is a sheet of two rows (label, one line, action on the right): Export DESIGN.md (asks Keep it / Replace it when the file is there) and Preview an HTML file, whose page shows below in a white framed iframe with the file path above it in mono. Screenshots: `design/design-handoff-*.png`.
- Phase 103: tour camera moves on recordings without scripted targets: ease in over 0.6 s to a 1.6x zoom centred on the clicks, hold, ease back to the whole app; always framed inside the window. No new screen.
- Phase 104: Vault board is a sheet with a query bar (mono labels, fields, Board / Table segmented) over columns on the sunken colour, each headed by a mono uppercase name with its count over a 2 px accent rule; cards are cut-corner surface tiles with the title in bold and up to three fields below. The table uses the mono header style of the contrast table. Screenshots: `design/vault-board-*.png`, `design/vault-table-dark.png`.
- Phase 105: PDF tools is a sheet: address row, the six tools as a segmented control, a file queue (files the tool does not use are dimmed), and for Redact a surface block with a 3 px accent rule listing what was found, a mono kind tag and the value masked in the middle. Screenshots: `design/pdf-tools-*.png`.
- Phase 106: an unusual turn is an error-toned note in its panel with the reason ("This turn read 100 tokens, 4.7x the usual 22 tokens for acme on opus-5-5. Normal is up to 47 tokens."). Budgets has "Turns against the usual": the panel, a Cost / Tokens / Time segmented control, and a line chart of the last 60 turns with the median and the top of normal as flat series. Screenshots: `design/anomaly-*.png`.
- Phase 107: App containers is a table (mono header) with a mono kind tag, the state in green or red mono capitals, CPU and memory, and Stop / Remove that turn into an inline accent-ruled question with Cancel and the action. Events below as time, name and the action in mono capitals (green for start and create, red for stop, kill, die, destroy). Screenshots: `design/app-containers-*.png`.
- Phase 108: Bitwarden is a sheet that shows one step at a time: install and log in (as text with code), the master password field, then search with "Use as" and each field of an item as a ghost button. Linked names list the name in mono, the item and field, and the value masked (first three and last two). Screenshots: `design/bitwarden-*.png`.
- Phase 109: Topic radar has the groups (mono textarea), source weights and the ntfy address on the left; on the right each group is a ranked row (mono 01, 02 in accent, name, count and sources), a 6 px accent bar for its weighted score, and its top three items as links. The draft sits in an accent-ruled block with Send to me asking once more. Screenshots: `design/topic-radar-*.png`.
- Phase 110: Run CI here lists jobs on the left (name, workflow and file) with the secrets to pass as checkboxes, and on the right the steps with a mono OK (green) / FAIL (red) mark, a JOB FAILED line, "Send the failure to Claude", and the raw log in a sunken mono block. Screenshots: `design/run-ci-*.png`.
- Phase 111: Pull requests has a GitHub / Gitea segmented control and the Gitea address in its header; the rest of the screen is unchanged, and its outside link now reads "Open in browser". Screenshots: `design/gitea-prs-*.png`.
- Phase 112: the Backend map gains a Gateway section: mono label with the file, a table of routes (methods, paths in mono, upstream, plugins as small mono capitals) and findings with a gold mono CHECK or a grey NOTE. Screenshots: `design/kong-gateway-*.png`.
- Phase 113: in the command bar, typed words show recipe rows above past commands: the ask in muted text, the command in mono, a gold "careful" tag when the risk check asks; a credit line links the two lists. Screenshots: `design/oneliners-*.png`.
- Phase 114: pattern cards are cut-corner surface tiles: name in bold with the checklist area in mono capitals on the right, then WHEN, COSTS and TRAP as mono labels before each line, and accent links to read further. They show under an ADR as "Patterns this decision touches" and all together in the new Patterns tab. Screenshots: `design/patterns-*.png`.
- Phase 115: Image X-ray is a sheet: image field with a list of local images, three big mono figures (efficient, in layers, wasted in the error tone), then a layers table where each row has a bar for its size and, in the error tone, the part a later layer throws away, plus "made by" in mono. Most wasted files below as surface rows. Screenshots: `design/image-xray-*.png`.
- Phase 116: Compose stacks is a wide sheet: stacks on a sunken rail (square state mark, green all up, gold partly, grey down; mono name; running/total), and for the chosen one the status in mono capitals with Start / Stop / Pull that turn into an inline accent-ruled question. A note block with a 3 px green or red rule reports compose's answer. Services in the mono-header table, then the compose file in a mono editor (no wrapping) beside live logs in a sunken mono block. Screenshots: `design/compose-stacks-*.png`.
- Phase 117: the Docker screen gains a host picker (mono, "name · host") when there is more than one docker context. A remote host shows a surface band under the header: a gold READ-ONLY tag with the context and its endpoint in mono, or a red ACTIONS ON tag once actions are turned on; buttons stay visible but disabled while read-only. Screenshots: `design/docker-remote-*.png`.
- Phase 118: the API client header gains HTTP / WebSocket / SSE / Socket.IO as a segmented control. A live connection keeps the address row (the kind as a mono tag), headers as in HTTP, and a log block: LIVE / CLOSED in mono beside counts in and out; each row is time (mono, ms), IN in teal or OUT in accent with a matching 2 px left rule, the event name as a small mono tag, the text in mono and its size. Socket.IO adds an event field before the message. Screenshots: `design/api-live-*.png`.
- Phase 119: Check after edits shows as panel notes ("Check after edits: 1 new error from tsc --noEmit ... Sent back to Claude", error tone; a quiet faint note when clean). Its sheet lists project, check and limit as mono labels, the opt-in checkbox, and the last runs as surface rows with a 3 px rule (green CLEAN / red "N NEW" in mono capitals) and each new error as file:line in mono, code in small mono, message. Screenshots: `design/check-after-edits-*.png`.
- Phase 120: Session review is a sheet with the sessions to review on a sunken rail (project in mono, requests and age) and, for one, a plain question with "Draft it". Drafted items are cut-corner surface rows: checkbox, kind in mono capitals (decision accent, fact teal, lesson gold), the text, confidence in mono on the right (high green, low faint; low ones start unticked and dimmed). A contradiction sits under its item on the sunken colour with a 3 px red rule, "CONTRADICTS · topic", BEFORE (date) and NOW side by side, and the replace checkbox. Screenshots: `design/session-review-*.png`.
- Phase 121: Project graph is a wide sheet: four mono-headed columns (services, modules, tables and stores, ADRs and decisions) of cut-corner node tags in mono on the sunken colour, with thin curved links (dashed for "touches"). Picking a node fills it with the accent, outlines what depends on it in accent and the decisions in gold, and dims the rest; the side lists both with mono kind labels and a gold rule for decisions. Screenshots: `design/project-graph-*.png`.
- Phase 122: Short-term compression adds a ninth savings colour, `--sv-9` (sienna #a0522d light, #b0703a dark; checked with the palette validator for lightness, chroma, colour-blind and normal-vision separation against the other eight). Its sheet has the per-panel switch, two big mono figures (compressed, tokens kept out) and one surface row per result with a 3 px sienna rule: kind in mono capitals, what it was in mono, size and tokens, "Show original" (sunken mono block) and "Give it back to Claude". Each compression also leaves a quiet note in the panel. Screenshots: `design/short-term-*.png`.
- Phase 123: TiDB joins the connection kinds with its own mono tag. A TiDB connection with VECTOR columns shows a surface strip under the editor with a 3 px teal rule: VECTOR in mono, the column, the vector (mono), cosine or L2, how many, and "Write query", which writes the SQL into the editor to read before running. Its plan header says when the plan ran for real (EXPLAIN ANALYZE), and each step shows estimated against actual rows and time. Screenshots: `design/tidb-*.png`.
- Large and vertical screens: Auto layout goes four panels across on a wide monitor (2400 px and up, landscape) and stacks three in one column on a monitor turned on its side; no panel gets narrower than 520 px (extra ones wrap to another row). Each panel sizes its reading column by its own width (container queries): 860 px from 1100, 940 px and 15 px text from 1500, tighter margins under 560. Screenshots: `design/screen-ultrawide-light.png` (3440×1440), `design/screen-vertical-dark.png` (1080×1920).
- Data grid follow-up: a WHERE row under the grid bar (mono label, column and operator selects, value, "Add filter"), filters as surface chips with a 2 px accent rule, the row range in mono tabular figures, rows per page and ‹ › . Sortable headers show ↑ or ↓ in the accent; the picked cell has a 2 px accent outline. Screenshots: `design/data-grid-*.png`.
- Past sessions follow-up: Words / Meaning / Both as a segmented control (the segmented control now shows its pressed choice everywhere, also with `.on` or `aria-pressed`), a thin teal bar of how many turns are understood by meaning, and each hit tagged MEANING, WORDS or WORDS + MEANING in teal mono capitals. Screenshots: `design/past-meaning-*.png`.
- Remote panels follow-up: the remote chip is now a button that opens a popover (same surface as the worktree one): ON HOST in mono capitals, the folder and branch in mono, a PORT field with "Forward and browse", and Merge / Drop for a remote worktree with an inline question. Screenshots: `design/remote-*.png`.
- No network on its own: the Spend sheet shows "Fixed rates" (or "Rates from <date>") in faint text with a ghost small Update rates button; Connections > Integrations has a ghost small "Show GitHub stars" in the header, and cards show stars only after it was used.
- Opt-in network: the reader starts with no feeds and offers the suggested ones as ghost small "Add <name>" buttons under "Suggested: nothing is read until you add it"; the Cloud sheet head has a "Check every 6 hours" switch, off by default.
- Theme picker shows Ink and Paper (ids stay claude-dark and claude-paper). Appearance has a "Check for updates automatically" switch under "Open when the Mac starts"; a release update is offered with a confirm that names the version, then the same progress bar as a source update.
- Site home (first pass): white hero with the splash lines "Every token. / In plain sight.", an accent rule, the promise in the system sans (semibold), one accent Download button with the cut corner; three pillars with framed screenshots (big cut), an "And everything else" grid in hairlines, small-teams and privacy bands, footer with the three bars and "Not affiliated with Anthropic.". Screens: docs/design/site-home-*.png. The pillar screenshots are interim: they still show the pixel mascot and zero values.
- Site motion (B): the three bars draw in left to right (0.7 s, staggered); the accent button's cut grows on hover; pillar screenshots open along the 45 degree diagonal from the top-left corner as they scroll in, and their text slides in from bottom-left. All of it off with reduced motion.
- Home film (A): the hero shows a session recreated in HTML in the Paper theme colors, looping while on screen: your message, Claude's reply, an Allow card for Bash `npm test`, the press, the test result, the answer, and the turn cost at the top counting up with the app's split-flap. Labelled "Recreated in code from the app. Numbers are illustrative." Still and complete with reduced motion. Frames: `design/site-film-*.png`.
- Site inner pages (Download, Security): a page head with a mono label and a large sans title, then a narrow column; sections split by hairlines, facts as label and text rows, commands in a surface block with the small cut, tables with mono headers. Download has one accent button (Apple silicon) and one outlined (Intel). Screens: `design/site-download-*.png`, `design/site-security-*.png`.
- Docs and Changelog: docs pages have a left column of page links (hairline on the left, accent on the current one; a scrolling row on phones) and the text in a narrow column; the docs index is the hairline grid. Each release in the changelog is a block with its name, a mono tag and date line, the notes, and a link to downloads and checksums. Screens: `design/site-docs-*.png`, `design/site-changelog-*.png`.
- App icon (2026-10-26): the mascot icon is retired. The new one is the three bars on paper inside the
  macOS icon grid (824 px body, 100 px margin, the standard rounded body): two ink bars and a short accent
  bar, the top bar ending in the 45 degree cut. Source `app/build/icon.svg`, rendered to `icon.png`.
  Preview: `design/app-icon.png`.
- Top bar mark: the pixel logo is replaced by the same three bars at 16 px (`BrandMark` in `App.tsx`).
- Panel meter: the arcade HUD (portrait, HP, round, KOs, slanted and blinking bars) becomes a flat meter
  with the cut corner: CONTEXT bar and percent left, 5H and 7D plan windows, CACHE minutes, and on the
  right the panel cost in the display face with SAVED under it in the accent. Low values turn the deep
  accent without blinking. Appearance previews use the same meter. Screen: `design/meter-paper.png`.
- Persona avatars: the caped mascot is retired; each persona is its initial in the display face on the cut-corner tile tinted with its color (`RoleHero.tsx`). Screen: `design/personas-initials-paper.png`. The mascot now appears nowhere in the app; `src/mascot.ts` stays for the easter egg.
- Site screenshots now come from `app/scripts/shots.mjs` (real app, Paper theme, sample project `acme`).
- Fix: the thinking row lost its text. An old rule (`.thinking span`, from when it was three dots) turned every span in the row into a 3 px bar, so only the loader and stray bars showed. Removed; the row reads loader, verb, file or command, time. Screen: `design/thinking-fixed.png`.

## GitHub inside the app (2026-10-27)

Developers should leave the app as little as possible. GitHub is brought in as our own screens over
its API, not as github.com in a web view: it keeps the app's look and weight, and it can tie pull
requests, checks and reviews to panels, which the website cannot. Planned for v1.2 (`docs/ROADMAP.md`).

## Ideas taken from other open-source projects (2026-10-27)

Ideas, not code: a Trace tab (from MLflow tracing), a local MCP server over the app's own data (from
OpenSEO), and a JSON command line, plus Google Workspace through `gws` (from googleworkspace/cli).
Planned for v1.2. Left out: Humanizer (a writing skill; people can add it from the Catalog) and
CL4R1T4S (leaked system prompts of other companies: not something we build on).

Later the same day, three more, again ideas and not code: a "Last 30 days" brief in Research (from
mvanhorn/last30days-skill: what people posted on Reddit, YouTube, Hacker News and GitHub, ranked by
each source's own engagement, through official APIs and the person's own credentials), RSSHub routes
and feed discovery in News (from DIYgod/RSSHub and RSSHub Radar: the instance is the person's to set,
empty by default), and any site as an app in the drawer (from tw93/Pake: its own storage, optional CSS
and user agent, held to its own hosts). Left out: InstaPy. It automates likes, follows and comments on
Instagram, which Instagram's terms forbid, and the app does not automate engagement on anyone's
account.

## Money: direction (2026-10-27, on hold)

Direction, not a plan yet: the app stays free and complete for one person, and a paid plan adds what
teams need (shared panels, cost by team, a team vault, support). Nothing free today becomes paid. On
hold until a lawyer has read the Claude Agent SDK terms; no price, page or checkout before that.
Taken from how Halo pairs a free community edition with paid editions.
## Distribution and languages (decided 2026-10-27)

- Homebrew: our own tap first (`supertokenman/homebrew-tap`, updated by a workflow on each published
  release); the official `homebrew/cask` later, once the app qualifies under its notability rules. The
  install line goes public only once the tap exists.
- README languages: Portuguese (Brazil) and Spanish first (`README.pt-BR.md`, `README.es.md`), because
  Brazil and Latin America are a natural audience. They translate README.md and add nothing; a change
  to README.md is carried to both.

## Opening screen: dark, product in motion (decided 2026-10-27)

- **Why dark.** The window paints `#0f0f0e` before anything loads (`electron/main.ts` backgroundColor). The
  old white film made every launch flash dark, white, dark. The opening (`#boot` in `app/index.html`, the
  splash in `app/src/Splash.tsx` and the closing in `app/src/boot.ts`) uses that exact dark in every theme,
  so nothing flashes between the window appearing and the app. The dark is the app's own tone.
- **Why product in motion, built from the mark.** The opening is the mark (`app/build/icon.svg`) doing what
  the product does: the three bars fill like meters while a token counter and its cost climb in step (reais
  on *-BR locales, US dollars elsewhere, via `currency.ts`). Then the top bar takes the 45 degree cut (the
  signature), the short bar lights in the accent `#d97757`, the mark settles, and the name is revealed
  through a clip where the counter was, before everything dissolves into the app. Code-driven SVG + CSS, no
  video, no dependency.
- **Numbers are illustrative.** Fixed constants, labelled only "tokens" and a cost; never read from real
  data and never presented as the person's usage.
- **Timings.** Full, about 2 s, once a day: fill and count 0.1 to 1.0 s (staggered bars), cut and accent
  1.0 to 1.4 s, name reveal 1.25 to 1.8 s, dissolve 0.5 s once the app is ready. Every other launch, about
  0.6 s: the assembled mark, a quick accent sweep and the name. Hard cap 6 s whatever happens.
- **Compositor only.** Only transform, opacity and clip-path animate; the counter writes text into two
  fixed spans with no React render per frame.
- **Reduced motion** (or motion turned off): the still mark and name, nothing counts.

## Own controls, no macOS defaults (decided 2026-10-27)

- **The rule.** "Tudo que é padrão do sistema operacional (macOS) devemos ter nossa identidade autoral":
  every control the system would draw is drawn by the app, in the model menu's look (`app/src/ModelMenu.tsx`,
  the `.mm` popover: 12 px corners, the strong border, the accent tick, 140 ms rise) and with the theme
  tokens, so Ink, Paper and every other theme follow without extra rules. Full keyboard, ARIA roles and
  `prefers-reduced-motion` are part of each control, not an extra.
- **The kit** (`app/src/ui`, no dependency):
  - `Select`: a trigger and a listbox popover. It takes the same `<option>` and `<optgroup>` children as a
    native select (an `<optgroup data-sub>` opens as a submenu, like Effort in the model menu), and its
    `onChange` gets `{ target: { value } }`, so a migration renames the tag. Arrows, Home, End, type to
    jump, Enter, Escape; the field is as wide as its widest option, as a native one is.
  - `Checkbox`, `Switch` (role switch, on the app's `.switch` track), `Radio`, `RadioGroup`: a real input
    underneath for labels, forms and handlers, our face over it (`appearance: none`).
  - `NumberField`: the number input with our stepper; the system spin buttons are hidden.
  - `Slider`: the range input with our track, accent fill and square thumb.
  - `DateField`, `TimeField`, `DateTimeField`: **a text field with validation, not a picker.** A calendar
    of our own would weigh more than all the rest of the kit for 13 fields; the formats are the ones the
    native inputs handed over (YYYY-MM-DD, HH:MM, a space for the T), a wrong value shows the red edge and
    is not passed on.
  - `ColorField`: our own small picker, a swatch that opens the theme's colors and a hex field.
  - `Combobox`: in place of `<input list>` and `<datalist>`.
  - Tooltips: one delegated host (`app/src/ui/Tooltip.ts`) draws `data-tip` after a short delay, above or
    below its element, and links it with `aria-describedby` while shown. Elements with no words of their own
    carry an `aria-label`. The source never uses `title=`.
  - `confirmDialog`, `alertDialog`, `promptDialog`: a promise each (`if (await confirmDialog({ ... }))`),
    focus kept inside, Escape cancels, a `danger` variant for removals. They replace `confirm()`,
    `alert()` and `prompt()`.
  - `ContextMenu`: the window's right-click menu (spelling, cut, copy, paste, links, Inspect in development)
    is drawn by the app; the main process sends the rows and runs the chosen one. Screens can open their
    own with `openContextMenu`.
  - Files: opening goes through the in-app file picker (`FilePicker.tsx`, `pickFile` for a file the window
    reads), saving goes into a folder from the in-app folder picker, under the suggested name, never over
    a file that is there.
- **The guard.** `app/scripts/no-native-ui.mjs` runs in CI (the `test` job) on the syntax tree of
  `app/src`: it fails on `<select>`, `<datalist>`, `<input list>`, raw checkbox, radio, range, number, date,
  time, color and file inputs, `title=` on an HTML element and `confirm()`, `alert()`, `prompt()`. The kit's
  own files are allowed; any other exception needs a `no-native-ui: <reason>` comment. `iframe title` is
  allowed: it names the frame and draws no tooltip.
- **What stays native, and why.**
  - The menu bar (the application menu): it lives in the macOS menu bar, outside the window. Same for the
    tray (menu bar extra) menu.
  - macOS notifications (Notification Center) and permission prompts (camera, microphone, screen, files,
    Keychain, Touch ID): drawn by the system on purpose, and the person must be able to trust they come from
    macOS.
  - The system file dialog only behind "Use Finder..." in the in-app pickers, when the person asks for it
    (and `pickFolder` when no picker is mounted). The system save sheet is no longer used.
  - Scrollbars were already ours.
