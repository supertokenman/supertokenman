# UI backlog (from the review of 2026-10-26)

What Yuji found using the app, and what the screenshot sweep of every sheet adds. Each item gets a
before and after when it is done. Systemic items first: one fix reaches many sheets.

## Systemic

- [x] Tooltips: icons in the top bar show nothing on hover (system tooltips do not draw over the drag
      area). App-wide tooltips in the app's look (`tips.ts`).
- [x] Fields: the system's blue focus ring. Accent edge instead.
- [x] Radios and checkboxes in system blue. Accent.
- [x] A disabled main button reads as a muddy accent ("Sign in with Microsoft", "Save and connect").
- [x] Buttons stretched to the full width of a form (Team room: "Create and copy invite", "Join").
- [x] Dashed-border fields (Filter in Markets, Add a site in News) next to solid ones: one field style.
- [x] Error notes ("No connection right now"): a heavy box for a small message.
- [ ] Tables: wrapping names ("Prompt cache" on two lines), status pills in two styles, row actions
      (delete, edit) not visible.
- [x] The panel id chip ("s46", dashed box) beside the folder name.
- [ ] Badges in the top bar overlapping the next control ("Update" pill under the palette badge).
- [ ] Filter chips with a count ("Plugins 3926"): no icons, the count reads as noise.

- [x] Native selects, date and file inputs, resize grips: the app's caret and button.
- [x] Plurals: "1 turns", "1 screens", "1 files" (shared/plural.ts).
- [x] Secondary actions inside sheets read as loose text: a hairline edge.
- [x] Sheets that cover the panel header's tabs: not a defect, a sheet is a modal over a dimmed window.
- [ ] Mostly empty sheets with a sentence and no action (about 30 sheets): compact dialogs, or an
      empty state with the action that fills them.
- [ ] Commands, paths and env var names in sans and not copyable: mono with a Copy button.
- [ ] Content clipped at the sheet bottom or truncated without an ellipsis or a tooltip.
- [ ] Left edges out of line with the sheet title (149/157/165 against 159).
- [ ] More than one accent (persona rainbow, gold, green and red heatmap tiles, yellow tags).

## Found in the sweep, per sheet

- Ports: port 9336 repeated on six rows; commands cut with no tooltip.
- Health: implausible numbers (1877.5 GB, 7993% CPU) and identical rows: likely a bug.
- Cloud: a toggle overlaps its label ("eck every 6 hours").
- Diagnostics: the same GitHub error fourteen times; group with a count and an action.
- Today: hour labels inside the timeline bar, "20" clipped; THREE STORIES heading with nothing under it.
- Markets: prediction titles cut mid-word with no ellipsis.
- Catalog, Personas, Connections, Appearance: last row clipped by the sheet edge.

## Sheets

- [x] Where the time went: zero-length bars still draw a tick; machine names as row labels
      (`yujiarima-panel-tcl4u`).
- [ ] Markets: "Add: WEGE3, AAPL, SOL" needs a list to pick from (search with suggestions), not a
      symbol from memory.
- [ ] News: the feed sidebar is a plain list; suggested feeds are bare text links.
- [ ] Database, new connection: a long form, five engines only. More engines (Supabase, Neon,
      PlanetScale, Turso, MongoDB, Redis, ClickHouse...) as cards with logos, and the connection string
      built from fields.
- [ ] Savings table (Tool, Tokens, Kept off, How we know): layout and pills.

## Flows

- [x] Integration guides (Connect Outlook and the rest): too much text, not "play-action". Steps as
      cards with one action each, copy buttons, progress.
- [x] External setup pages (Get Ollama and the like): bring the steps into the app's own look, with the
      source linked, instead of opening the vendor's site.
- [x] Folder picker: the macOS dialog; an in-app picker (recent projects, git repos found on disk,
      search) with the system dialog as a fallback.
- [x] Panels: animate create, move and close.
- [ ] Apps sidebar (WhatsApp and the rest): opening, closing and switching lag.
