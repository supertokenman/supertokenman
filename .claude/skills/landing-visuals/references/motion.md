# Motion

Our default is still. Motion must answer one of: it explains how a feature works, it confirms an action,
it keeps space continuous (where something came from / went), or it prevents a jarring jump. "Looks cool"
is not a reason on anything seen more than once a visit.

## Decide

| How often it is seen | Do |
| --- | --- |
| Many times a session (keyboard actions, app panel switching, command palette) | No animation |
| Often (hovers, list moves) | Colour/opacity only, at most 150ms |
| Occasionally (dialogs, drawers, toasts) | Standard enter/exit |
| Once (the site hero, first run) | One orchestrated moment is allowed |

One page-load moment beats a fade-up on every section; fade-up on scroll everywhere reads as a template.
In the Electron app never animate keyboard-initiated actions.

## Values

Easing curves (verbatim from emil-design-eng, MIT, Emil Kowalski):

```css
/* Strong ease-out for UI interactions */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
/* Strong ease-in-out for on-screen movement */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
/* iOS-like drawer curve (from Ionic Framework) */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

Our site already has `--ease: cubic-bezier(.2, .7, .2, 1)`; use it for entering things, `--ease-in-out`
above for things moving on screen, `linear` only for constant motion (a meter filling at a steady rate),
plain `ease` for colour changes. Never `ease-in` on UI: it feels late.

Durations: press 100-160ms; tooltip/small popover 125-200ms; dropdown 150-250ms; dialog/drawer 200-400ms;
marketing explanation may run longer. UI stays under 300ms. Exits faster than entrances. Stagger 30-80ms
between items, never blocking input.

## Rules

- Animate `transform` and `opacity` only (clip-path and filter sparingly). Never `transition: all`; never
  animate `width/height/top/left`.
- Enter from `scale(0.95)` + `opacity: 0`, never from `scale(0)`. Popovers grow from their trigger; dialogs
  from centre.
- Interruptible UI uses transitions, not keyframes (keyframes restart from zero). `@starting-style` for
  entry without JS where supported.
- Prefer CSS, then the Web Animations API (`el.animate`), then small vanilla JS. No animation library on
  the site.
- Set a style on the element itself, not a CSS variable on a big parent, inside per-frame code (a variable
  on a parent restyles every child).
- `will-change: transform` only on the one element that moves every frame, and only while it does.
- Pointer-follow (tilt): smooth toward the target with a simple spring/lerp each frame instead of snapping;
  fine pointers only.
- Loops run only while on screen (IntersectionObserver) and pause when the tab is hidden.
- Anything that autoplays for more than 5 seconds next to content needs a pause control (WCAG 2.2.2).

## Scroll

- Reveal on scroll: `clip-path: inset(0 0 100% 0)` to `inset(0)` once, when 10-20% is visible; content
  must be readable without JS (start visible, let JS add the hidden state).
- Scroll-linked progress: CSS `animation-timeline: view()` / `scroll()` where supported (Chromium; check
  others before relying on it) with no fallback motion elsewhere, or our `components/scroll-camera.js`.
- Scroll scrubbing a real recording (idea from scroll-world and oil-motion): pin a `<video>`, set
  `currentTime` from scroll inside rAF, never queue a new seek while one is pending, load the file as a
  blob URL so it is fully seekable, encode with short GOP (`-g 8`, phones `-g 4`, 720 wide). Only for a
  real app recording and only if it fits the image budget; a still poster is the fallback.
- Never hijack scroll speed or direction. Scrolling up must play the move backwards cleanly.

## Reduced motion

`prefers-reduced-motion: reduce` removes movement (position, rotation, tilt, parallax, scrubbing, autoplay
video). Short opacity/colour changes that explain state may stay. The page must look complete and be
fully usable that way; check it with `reducedMotion: 'reduce'` in Playwright.
