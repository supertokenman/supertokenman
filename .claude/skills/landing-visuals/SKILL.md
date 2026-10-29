---
name: landing-visuals
description: Use when building or redoing visual sections of the SuperTokenMan site (site/), such as the hero, feature cards, tilt or 3D-looking pieces, flip cards, a perspective carousel, dot-matrix drawings, layered app screenshots, or when exporting a piece of the page as a vertical 9:16 animated post for social networks.
---

# Landing visuals

Pieces and rules for making the site feel alive without losing who we are. `docs/BRAND.md` rules over
this file; every brand decision you make goes there as a line in the same commit.

## Rules

- **Own identity only.** Take the recipe from references (calm dot grid, heavy lowercase headline with a
  period, small mono "nº" labels, one highlighted block), never the look. Our parts: the accent
  (`--accent`, `#c65d3b` light / `#d97757` dark), the 45 degree cut corner, mono labels, flat colour, no
  drop shadows, no emoji. Nothing that looks like Anthropic's or any other brand's site; no logos but ours.
- **Real material.** Screens come from the real app: `site/assets/*.jpg`, `site/assets/screens/`, or
  `cd app && npm run build && node scripts/shots.mjs <dir>`. Dot drawings show OUR things: panels side by
  side, the link line between panels, the token meter filling, an approval card.
- **Honest copy.** Plain English. Reuse sentences already on the site; do not add claims or numbers we
  cannot back (no made-up prices on decorations).
- **No other hosts.** No CDN, no Google Fonts, no analytics. Fonts are self-hosted in `site/assets`
  (`@font-face` in `site.css`). See `docs/NETWORK.md`. Check with `page.on('request')`.
- **Budget.** Added JS on the home page at most 15 KB gzip; no new image over 150 KB. Measure:
  `gzip -9c file | wc -c`.
- **Motion.** Sparse and calm. `prefers-reduced-motion: reduce` turns it all off (still pictures, no
  turning, no tilt). Tilt only for fine pointers. Loops run only while on screen.
- **Accessible.** Flip cards are `<button aria-pressed>`; both faces are in the DOM. A carousel has real
  Previous/Next buttons, arrow keys, a live "n of m" and inert hidden slides. Decorative scenes and dot
  drawings are `aria-hidden`.

## Pieces (`components/`)

- `visuals.js` / `visuals.css`: the shipped copies are `site/assets/visuals.*`. Dot-matrix renderer
  (`data-dots="rows/split/by/slash"`: `#` ink, `*` accent, `+` accent that fills in order like a meter,
  anything else a faint dot; drawn on a canvas), pointer tilt (`data-tilt="deg"` inside
  `data-tilt-zone`), flip buttons, the `.dotgrid` paper background, `.nlabel`.
- `layered-shots.html`: three real screens stacked in Z that tilt with the pointer.
- `flip-card.html`: one flip card.
- `carousel.html`: a perspective carousel, self-contained (markup, style, script).

## Workflow

1. Serve: `cd site && python3 -m http.server 8765 &` and keep the PID; stop it with `kill <pid>` (never
   `pkill -f`).
2. Before you change anything: `OUT=<dir> node scripts/shoot.js before` (1440x900 and 390x844).
3. Build with the pieces. Keep everything else on the page working (site.js guards missing elements).
4. After: `OUT=<dir> node scripts/shoot.js after` also takes a reduced-motion shot and a flipped card.
   It prints console errors, hosts requested (only `localhost` allowed) and scroll width vs viewport
   (equal means no horizontal scroll). Look at the pictures and show them to the person.
5. Measure the gzip sizes, add the BRAND.md lines, commit explicit paths.

`require('playwright')` works and `chromium.launch()` needs no options.

## Export as a vertical 9:16 post

`node scripts/export-9x16.js http://localhost:8765/ '#features' <outdir> 8` isolates one piece on the
page background, moves the pointer in a slow loop (so tilt and fills play) and records a 1080x1920 webm
with Playwright's video. Convert with `ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p out.mp4`. For a
single canvas piece, `canvas.captureStream(30)` into a `MediaRecorder` also works. Keep posts silent,
under 15 seconds, with the product name in the last frame.
