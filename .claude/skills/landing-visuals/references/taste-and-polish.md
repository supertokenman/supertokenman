# Taste and polish

Distilled design judgment for the site and the app. `docs/BRAND.md` wins over anything here. Sources
are in SKILL.md, NOTICE; this file is our own wording unless a line says "verbatim".

## Before building: write the plan, then attack it

1. Write four lines: palette (our tokens only), type (which face does which job), layout (one sentence
   plus an ASCII sketch), the one memorable thing on this section.
2. Ask: would I produce the same plan for any other dev tool? If yes, change the part that is generic and
   write down why. (Idea from frontend-design, hallmark, taste-skill.)
3. Spend boldness in one place per section. Everything around it stays quiet.

## Known generic looks (and where we stand)

Generators drift to the same defaults. Know them so each one we keep is a choice, written in BRAND.md:

- cream ground + high-contrast serif + terracotta accent near `#d97757`. **Our dark accent is exactly
  that value.** It is a decided brand colour, so keep it, but never pair it with a cream ground or a
  generic serif, and keep the light page white (`--bg: #fff`).
- near-black page with one acid accent; newspaper hairline columns.
- identical rounded cards with the same soft grey shadow, gradient washes, glass panels, floating pill nav.
- tracked uppercase eyebrow above every heading, `A · B · C` meta strings, `→` glued to link text,
  monospace for small labels, `01 / 02 / 03` numbering. **We use mono "nº" labels on purpose** (BRAND.md):
  use them where they carry real data (a count, a version, a key), never as a decoration on every heading.
- emoji as icons, fake dashboards of grey bars, a hand-drawn browser window, invented logos/quotes/stats.

## Type and space

- Two or three sizes do the work: one very large, one reading size, one small. Five sizes per page max.
- Display: tracking -0.02 to -0.05em, leading 0.9-1.05. Running text 16-20px, leading 1.45-1.6,
  45-75 characters per line. Headlines at most two lines at every width; `text-wrap: balance` on
  headings, `text-wrap: pretty` on paragraphs.
- One grid, one pair of side margins (16px phone, 24-32px desktop). Gap between sections clearly larger
  than any gap inside one (120-200px desktop). Outer margins equal; asymmetry lives inside the grid.
- Cap the container (`--wrap`); at 1920 the gutters grow, the measure does not.
- About 80 words per screen; the hero is the headline, one sentence, one action, all visible at 1280x800.
- Left aligned by default; centre at most one moment.

## Details that make it feel finished

- Nested corners: our cut corner is 45 degrees; when a cut box sits inside another, the inner cut is
  smaller by the padding (outer = inner + padding), never the same.
- Optical alignment beats geometric: nudge play icons and arrow glyphs by 1-2px when they look off.
- Numbers that change or compare: `font-variant-numeric: tabular-nums` (token meter, prices, counts).
- Font smoothing: `-webkit-font-smoothing: antialiased` on the root for light-on-dark text on macOS.
- Real screenshots get a 1px inner outline in `--line` (an `outline` with negative offset) so a white
  screenshot does not melt into a white page. No drop shadows (BRAND.md).
- Hit areas: at least 24px, 44px on touch; extend small controls with a pseudo-element.
- Icons: one `currentColor` SVG recoloured by state; stroke weight matches the text weight next to it.
- Use the `…` character and real quotes; non-breaking space in `10&nbsp;MB`, `Ctrl&nbsp;K`, the product name.
- `translate="no"` on the product name and on code tokens.
- Press feedback on buttons: `transform: scale(0.97)` on `:active`, 100-160ms. Not below 0.95.
- Hover effects only under `@media (hover: hover) and (pointer: fine)`.

## Copy

Plain English, active voice, a button says what happens ("Download for Windows", not "Get started").
The same action keeps one name everywhere. No invented proof: no customers, quotes, logos or numbers we
cannot show. Errors say what happened and what to do; they do not apologise.

## Review format

When reviewing a section, report findings as one table: Severity (HIGH blocks use or misleads,
MEDIUM noticeable, LOW polish) | `file:line` | Before | After | Why. Add a short "considered but
rejected" list so the next pass does not redo the same debate. Look again the next day, and play motion
at 4x slower before calling it done.
