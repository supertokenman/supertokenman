# Audit

Run before showing any change. "Check" says how we verify with Playwright (`scripts/shoot.js`,
`scripts/demo-shots.js`) or by reading the code. Merged and condensed from Vercel's Web Interface
Guidelines (MIT; lines marked "verbatim") and Addy Osmani's web-quality-skills (MIT, ideas).

## Network and size

- [ ] Only `localhost` requested. Check: `page.on('request')` host set.
- [ ] Added home JS at most 15 KB gzip; new images at most 150 KB. Check: `gzip -9c f | wc -c`, `ls -l`.
- [ ] Images have `width`/`height` (or `aspect-ratio`); above-the-fold image not lazy, the rest `loading="lazy"`.
- [ ] Hero font preloaded (`<link rel="preload" as="font" crossorigin>`), `font-display: swap`.
- [ ] Video: `autoplay muted loop playsinline`, a poster, MP4 for Safari, none under reduced motion.

## Core Web Vitals (lab, desktop and 390px phone)

- [ ] LCP at most 2.5 s, CLS at most 0.1, long tasks after load none over 50 ms (INP proxy; field INP
      target at most 200 ms). Check: `PerformanceObserver` for `largest-contentful-paint`, `layout-shift`
      and `longtask` inside `page.evaluate`, with CPU throttled via CDP `Emulation.setCPUThrottlingRate`
      rate 4. Lab numbers are a proxy; we have no field data and must not claim scores.

## Layout

- [ ] No horizontal scroll at 390, 1440 and 2560 widths (`scrollWidth === innerWidth`).
- [ ] `overflow-x: clip` (not `hidden`, never `100vw`) where needed; grid image tracks `minmax(0, 1fr)`.
- [ ] Headlines two lines or fewer at every width; nothing overlaps a headline.
- [ ] Safe areas respected on the phone (`env(safe-area-inset-*)`) for any fixed element.

## Keyboard and screen reader

- [ ] "MUST: Visible, unobscured focus rings (`:focus-visible`; group with `:focus-within`); sticky/fixed
      elements never cover focus" (verbatim). Check: Tab through, screenshot focused states.
- [ ] Skip link, one `h1`, headings in order, `scroll-margin-top` on anchored headings.
- [ ] "MUST: Prefer native semantics (`button`, `a`, `label`, `table`) before ARIA" (verbatim).
- [ ] Decorative canvas/dot drawings `aria-hidden`; a meaningful halftone has `role="img"` + label.
- [ ] Flip cards `aria-pressed`; carousel buttons, arrow keys, live "n of m", inert hidden slides.
- [ ] "MUST: Drag/swipe/pinch/path gestures have a tap/click and keyboard alternative unless essential" (verbatim).
- [ ] Status never by colour alone. Contrast: text 4.5:1, large text and UI 3:1 in both themes.

## Motion

- [ ] Reduced-motion shot looks complete, nothing moves. Check: `reducedMotion: 'reduce'`.
- [ ] "NEVER: `transition: all`—list properties explicitly" (verbatim). Check: `grep -n 'transition: all'`.
- [ ] Only transform/opacity animate; loops pause off screen.

## Content and meta

- [ ] Every claim already on the site or backed by the product; no invented numbers, logos, quotes.
- [ ] `<title>` and description match the page; `color-scheme` and `theme-color` match the background.
- [ ] `…` and real quotes; product name `translate="no"`.
- [ ] No console errors or page errors.
