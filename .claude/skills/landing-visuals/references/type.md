# Type

Self-hosted fonts only: `.woff2` in `site/assets`, `@font-face` in `site.css`, licence file next to the
font, `font-display: swap`, preload only the face used above the fold. No Google Fonts or other hosts,
even for a trial. Subset to the characters used (`pyftsubset font.ttf --text-file=used.txt
--flavor=woff2`) and keep each file small; ours (`supertoken-display.woff2`) is 3.5 KB.

## Current roles (BRAND.md)

SuperToken Display for large titles, the system sans for running text, mono for labels with real data.

## Two-font headline (idea seen on insposite.com)

A two-line headline: line one in a heavy sans, line two in a condensed serif italic, the second line in
the accent colour. It works because the contrast is between whole lines with distinct jobs (statement,
then the turn), not a single decorated word.

How we would do it, if the brand adopts it:

- Line 1: SuperToken Display (or the system sans at 800), lowercase, ends with our period.
- Line 2: a condensed serif italic under the SIL Open Font License, self-hosted and subset (candidates to
  evaluate: Instrument Serif, Newsreader, Fraunces; check each licence file before use). In `--accent`.
- Same cap height visually: size the serif up 8-15% so the lines feel equal; tighten leading to ~0.95.
- Each line is a `<span class="l1">` / `<span class="l2">` inside one `<h1>`; screen readers read one
  sentence. Never break mid-phrase on a phone; test at 390px.
- Use it once (the hero), never in section titles.

Conflict to decide: hallmark and taste-skill treat a styled accent word inside a heading as a generated
tell, and the frontend-design skill lists "high-contrast serif + terracotta accent" as the most common AI
look. A whole second line, in our own display pairing, on a white page, avoids the worst of it, but it is
a brand decision: record yes/no in BRAND.md before shipping, and adding a second display face adds bytes
(budget it with the image budget, aim under 20 KB subset).
