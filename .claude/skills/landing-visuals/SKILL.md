---
name: landing-visuals
description: Use when building, polishing or reviewing visual sections of the SuperTokenMan site (site/) or the look of the Electron app, such as the hero, headlines and type, feature cards, tilt or CSS 3D pieces, flip cards, a perspective carousel, a scroll-driven camera, dot-matrix or halftone pictures of real screenshots, motion and easing, a quality/accessibility audit, or exporting a piece of the page as a vertical 9:16 post.
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
- **No libraries on the site** unless vendored in `site/assets` with their licence and justified in
  BRAND.md against the budget. CSS 3D and small vanilla JS first; three.js and GSAP cost 25-150 KB+ gzip.
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
- `halftone.js`: a real screenshot drawn as a dot field, accent only on chosen boxes (`references/halftone.md`).
- `scroll-camera.js` / `.css`: a sticky stage where scrolling flies a camera past real screens in CSS 3D
  (`references/3d.md`).
- `demo.html`: demo of the two above (not on the site); `scripts/demo-shots.js` screenshots it.

## References (read the one for the job)

- `references/taste-and-polish.md`: plan-then-attack, generic looks to avoid, type and space numbers,
  finishing details, review table format.
- `references/motion.md`: when to animate, easing and duration values, scroll patterns, reduced motion.
- `references/3d.md`: CSS 3D first, the scroll camera, when three.js or GSAP would be worth the bytes.
- `references/audit.md`: the checklist to run before showing a change (network, size, vitals, a11y).
- `references/type.md`: self-hosted fonts, the two-font headline idea and its open brand question.
- `references/halftone.md`: making a halftone from a real screenshot read well.
- `references/video.md`: 9:16 posts now (Playwright) and later (HyperFrames or Remotion).

## Workflow

1. Serve: `cd site && python3 -m http.server 8765 &` and keep the PID; stop it with `kill <pid>` (never
   `pkill -f`).
2. Before you change anything: `OUT=<dir> node scripts/shoot.js before` (1440x900 and 390x844).
3. Plan in four lines (palette, type, layout, the one memorable thing) and attack it for genericness
   (`references/taste-and-polish.md`). Build with the pieces. Keep everything else on the page working (site.js guards missing elements).
4. After: `OUT=<dir> node scripts/shoot.js after` also takes a reduced-motion shot and a flipped card.
   It prints console errors, hosts requested (only `localhost` allowed) and scroll width vs viewport
   (equal means no horizontal scroll). Look at the pictures and show them to the person.
5. Walk `references/audit.md`. Measure the gzip sizes, add the BRAND.md lines, commit explicit paths.

`require('playwright')` works and `chromium.launch()` needs no options.

## Export as a vertical 9:16 post

`node scripts/export-9x16.js http://localhost:8765/ '#features' <outdir> 8` isolates one piece on the
page background, moves the pointer in a slow loop (so tilt and fills play) and records a 1080x1920 webm
with Playwright's video. Convert with `ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p out.mp4`. For a
single canvas piece, `canvas.captureStream(30)` into a `MediaRecorder` also works. Keep posts silent,
under 15 seconds, with the product name in the last frame.

## NOTICE

Sources studied for this skill (October 2026). "Copied" means short passages reproduced verbatim with
this attribution, under the source's licence; "ideas" means rewritten in our own words. Anything not
under a permissive licence was used for ideas only.

| Source | Repository | Licence | Use |
| --- | --- | --- | --- |
| frontend-design (Anthropic) | https://github.com/anthropics/claude-plugins-official (plugins/frontend-design) | Apache-2.0 | ideas |
| emil-design-eng (Emil Kowalski) | https://github.com/emilkowalski/skills | MIT | copied: three easing curves in motion.md; rest ideas |
| make-interfaces-feel-better (Jakub Krehel) | https://github.com/jakubkrehel/make-interfaces-feel-better | MIT | ideas |
| Web Interface Guidelines (Vercel) | https://github.com/vercel-labs/web-interface-guidelines (also vercel-labs/agent-skills web-design-guidelines) | MIT | copied: five rule lines marked verbatim in audit.md; rest ideas |
| hallmark (Hassan El Mghari) | https://github.com/Nutlope/hallmark | MIT | ideas |
| taste-skill (Leonxlnx) | https://github.com/Leonxlnx/taste-skill | MIT | ideas |
| scroll-world (oso95) | https://github.com/oso95/scroll-world | MIT | ideas (scrub technique) |
| threejs-skills (CloudAI-X) | https://github.com/CloudAI-X/threejs-skills | MIT | ideas |
| gsap-skills (GreenSock) | https://github.com/greensock/gsap-skills | MIT (skill text; the GSAP library has its own licence) | ideas |
| oil-motion | https://github.com/oil-oil/oil-motion | MIT | ideas (frame scrub, QA conditions) |
| remotion skills (Remotion) | https://github.com/remotion-dev/skills | no licence file found | ideas only |
| hyperframes (HeyGen) | https://github.com/heygen-com/hyperframes | Apache-2.0 | ideas |
| web-quality-skills (Addy Osmani) | https://github.com/addyosmani/web-quality-skills | MIT | ideas |
| insposite.com (two-font headline) | website | not applicable | idea only |
| skill-issue.in (halftone hero) | website | not applicable | idea only |

Copied passages are under the MIT License: Copyright (c) 2026 Emil Kowalski (motion.md easing curves);
Copyright (c) 2025 Vercel Labs (audit.md verbatim lines). Licence text:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

No code from any source was copied; `halftone.js` and `scroll-camera.js` are our own.
