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
