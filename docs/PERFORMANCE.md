# Performance review (2026-10-26)

Measured in the test profile (Linux, Xvfb with software rendering, one panel, idle). Absolute numbers
on a Mac with a GPU will be lower; the before and after are on the same machine.

| What | Before | After |
|---|---|---|
| Style recalcs while idle | ~120 per second | 0 |
| Layouts while idle | ~60 per second | 0 |
| Renderer task time while idle | 0.54 s per 5 s | 0.31 s per 5 s |
| Start-up bundle (renderer JS) | 1.74 MB (502 KB gzip) | 1.27 MB (377 KB gzip) |
| Main process: imports loaded | 0.50 s | 0.34 s |
| Main process: page loaded | 1.12 s | 0.92 s |

## What was wrong

- **Endless SVG animations.** The HUD's hero (SMIL: blink, bob) and a few status marks (local model
  "asks" and "up" rings, battery low and charging, the next-event dot) ran forever, so a still window
  repainted every frame. The hero now moves for 8 s after its mood changes, then holds its first frame
  while calm (idle, focus, sleep), and whenever the window is in the background. Status marks play a
  few times and stop.
- **Every sheet in the start-up bundle.** 64 sheets that only render when opened now load on first open
  (`React.lazy` inside `Presence`, which holds a `Suspense` with no fallback).
- **Drivers loaded at start-up.** mysql2, pg, socket.io-client and the MCP client now load on first use.

## Left as it is

- The rest of the idle renderer time is the text caret and the compositor; not measurable apart here.
- The Claude Agent SDK (about 160 ms to import) is needed for the first panel.
- About 2 s from launch to a usable composer in this environment; most of it is Electron starting and the
  first panel's session.

## How to measure again

- `STM_PERF=1`: the main process logs start-up marks.
- `STM_IPC_COUNT=1`: logs, every 10 s, how often each IPC channel ran in both directions.
- In DevTools, Performance > idle for 5 s: the Layout and Recalculate Style counts should stay near zero.

## Measured on each release

`.github/workflows/perf-mac.yml` runs after each published release, and by hand from the Actions tab
with a tag. On a `macos-latest` runner (Apple silicon) it downloads the released dmg, checks it against
SHA256SUMS, and runs `app/scripts/perf-mac.mjs` on the signed app, driven over Chromium's debugging
port on loopback like the proof. Every launch has a fresh profile; Claude Code talks to the local mock
Anthropic API (`app/scripts/proof-mock-api.mjs`), so there is no key and no network for it.

What it records, against the v1.1 budgets in docs/ROADMAP.md:

- Launch to window shown, and to the composer usable (enabled and taking focus), from process spawn:
  the median of 5 launches. Polled every 50 ms, so a number can be up to 50 ms late.
- Idle for 30 s with 1 panel, then with 4: layouts and style recalcs per second (CDP
  `Performance.getMetrics`), CPU and memory of the app and every process under it (`ps` once a
  second), and memory per added panel.
- Typing 200 characters into the composer: the longest frame and the frames over 16 ms
  (`requestAnimationFrame` gaps), and the longest input to paint (Event Timing).
- Sizes: renderer JS and CSS in `app.asar`, gzip of the files `index.html` loads at start, the .app
  on disk and the dmg.

The numbers go to `perf.json` and `PERF.md` in the `perf-mac` artifact (30 days), and are attached to
the release as `perf-mac-<version>.md` and `perf-mac-<version>.json`. The next run reads the previous
release's json and adds a comparison; changes over 10% are marked. Nothing fails on a number yet:
budgets come once there are a few releases of numbers. A CI runner is a shared VM, so read single
changes with care; a trend over releases says more.

