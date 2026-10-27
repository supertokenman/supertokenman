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

## Typing in the composer (2026-10-27)

The first release numbers (0.1.8, `perf-mac`) had typing 200 characters at 238 frames over 16 ms, a
longest frame of 133 ms and a longest input to paint of 184 ms.

What was wrong: the composer grew with its text by setting its height to 0, reading `scrollHeight`, and
setting it again, in a layout effect on every change of the draft. Each read forced a synchronous layout
of the whole window, all panels included: three layouts per key. The composer now grows in CSS
(`field-sizing: content`, still capped at 220 px, one line while the placeholder shows), and the effect
is gone.

Before and after on the same Linux machine under xvfb, CPU throttled 4x over CDP to come closer to a
shared runner, `node app/scripts/perf-typing.mjs --throttle 4` (per key, over 200 keys):

| | Layouts | Layout time | Task time | Longest frame | Longest input to paint |
|---|---|---|---|---|---|
| 1 panel, before | 3.02 | 3.81 ms | 24.0 ms | 50 ms | 136 to 144 ms |
| 1 panel, after | 1.02 | 1.84 ms | 19.8 ms | 33 ms | 136 ms |
| 4 panels, before | 3.03 | 3.70 ms | 24.5 ms | 33 to 50 ms | 64 to 72 ms |
| 4 panels, after | 1.02 | 1.91 ms | 21.9 ms | 33 ms | 56 ms |

The forced layouts are gone; the rest of the time per key is the panel's React render (about 1 ms per
key unthrottled) and painting. The longest input to paint with one panel did not move: it is one slow
event, not the typing itself. Not yet measured on a Mac: the next `perf-mac` run shows it.

"Frames over 16 ms" counts jitter on a 60 Hz screen (a 16.8 ms frame is not a dropped one), so
`perf-mac` now also records frames over 33 ms.

Held in CI: the `network` job types 200 characters into the built app and fails above 1.5 layouts per
key (`perf-typing.mjs --max-layouts-per-key 1.5`). It counts layouts, not time, so a slow runner does
not fail it; on the old code it reads 3.02 and fails.

## Scrolling (2026-10-27)

Measured with `node app/scripts/perf-scroll.mjs`: a panel gets 2000 transcript lines (1000 prompts and
replies with headings, lists, inline code, a code block and a table or quote each) the way a picked-up
past session arrives, every "Show earlier" is opened, and the transcript is scrolled top to bottom
120 px a frame (3449 frames, 411 000 px). `--trace` adds the main thread's time per frame by trace event.

What was wrong: the panel kept every line it drew in the DOM. Nothing laid out while scrolling, but
every frame painted, hit-tested (the hover under the pointer) and moved the scroll offset over the whole
tree, so the cost grew with the transcript: paint was 2.8 ms a frame with 600 lines and 7 ms with 2000.

What changed:

- The transcript is windowed (`app/src/windowed.tsx`, no new dependency) once it has 300 items or
  more: the lines within two screens above and three below the view are drawn, the rest is held as
  space at each line's measured height (a ResizeObserver follows code blocks, images and folds; a line
  not drawn yet counts 160 px, and scroll anchoring keeps the view still when one above it is
  measured). It is drawn again about once a screen of scrolling, not each frame. Under 300 items,
  which is every panel until "Show earlier" is opened (150 lines a step), nothing changes.
- Folds of steps (and a step's full argument) keep their open state in the panel, so a run drawn
  again after scrolling away is as it was left.
- `Markdown` is memoized on its text, and parsed replies are kept (600, newest), so a panel redraw
  does not parse the streaming reply again and a line drawn again is not parsed again. Markdown
  parsing and token counting stay on the main thread: in the profile they were under 1% of the scroll
  (parsing runs when a line is first drawn; token counts are not computed during scroll), so a Web
  Worker would add a round trip and a height jump for nothing measurable.

Before and after on the same Linux machine under xvfb (`perf-scroll.mjs`, two runs before):

| | Drawn after the scroll | Paint / frame | Hit test / frame | Scroll offset / frame | Frames over 33 ms | Longest frame |
|---|---|---|---|---|---|---|
| Before | 2000 | 6.75 to 7.14 ms | 1.57 to 1.61 ms | 1.49 to 1.61 ms | 4 to 9 | 167 ms |
| After | 13 | 1.25 to 1.38 ms | 0.52 to 0.60 ms | 0.10 ms | 3 to 9 | 33 to 67 ms |
| Before, CPU 4x slower | 2000 | | | | 3332 of 3449 | 267 ms |
| After, CPU 4x slower | 13 | | | | 72 | 83 ms |

The windowing costs about 0.6 ms of layout a frame on average (one layout when a screen of lines is
swapped in). Frames over 16.7 ms stay at about a third of frames before and after: under xvfb that is
the display's own jitter, the same with 80 lines (319 of 809), so it says nothing here; on a Mac the
next `perf-mac` run shows it. The default panel (150 lines, no "Show earlier") scrolls at that floor
already (0 frames over 33 ms) and draws as before.

Nothing lost: the lines are the same components; copy buttons, links and folds work in a drawn line;
stick-to-bottom on a new line is checked by the script (from the top, a new note scrolls the view to
the end and is drawn). There is no find in the transcript in the app today (Electron has no built-in
find bar and the app wires none); a selection dragged across more than the drawn five screens copies
only what is drawn, the export sheet copies the whole session.

Held in CI: the `network` job runs `perf-scroll.mjs --max-drawn 300 --max-over-33 1000`: it fails
when the transcript is drawn in full again (2000 on the old code), when a new line does not scroll to
the bottom, or when nearly every frame is dropped. The frame bound is loose on purpose: a shared runner
is slower than this machine, and the count is the guard.

## Launch (2026-10-27)

0.1.9 on the signed app (`perf-mac`): window shown 1397 ms, composer usable 2385 ms, start-up chunks
438 KB gzip. Where the time went, from `STM_PERF=1` marks (now also "entry started", "panel asked",
"panel path and office checked" and "panel ready") and `node app/scripts/perf-launch.mjs`:

- About 300 ms is Electron itself, before any of the app's code runs. Not ours to cut.
- **The packaged app read the shell's PATH by starting a login shell (`zsh -ilc`) synchronously while
  the main module loaded**, before the window existed. With a real profile (nvm, oh-my-zsh) that takes
  from a few hundred milliseconds to seconds, up to its 4 s timeout. It only runs in a packaged build,
  which is why the Linux numbers below never showed it. Now the shell is read in the background
  (`shellPathAsync` in `electron/packaged.ts`); PATH has the usual places meanwhile, and the first
  panel, the OfficeCLI check and Headroom wait for the shell's PATH, so what they find is unchanged.
- The main process was about 250 files loaded one by one through Node's ESM loader. It is now one file,
  `dist-electron/electron/app.mjs`, joined by esbuild after tsc (`app/scripts/bundle-main.mjs`);
  packages in node_modules load as before.
- The renderer's start-up script was 1.2 MB (371 KB gzip): a third of it was xterm and its add-ons, for
  a terminal that opens only on its tab. The terminal, Preview and 20 sheets that open only on a click
  now load when first opened. 619 KB, 197 KB gzip (the CSS, 64 KB gzip, is apart).
- The window already shows at once on a dark background, with no white flash; nothing on the path to
  the composer waits for the network, and the composer does not wait for Claude Code to start.

Before and after on the same Linux machine under xvfb, unpackaged, fresh profile, median of 7 launches,
run twice each, `xvfb-run -a node app/scripts/perf-launch.mjs --runs 7`:

| | Window shown | Composer usable | Start-up JS, gzip |
|---|---|---|---|
| Before | 760 ms, 804 ms | 1070 ms, 1119 ms | 371 KB |
| After | 739 ms, 766 ms | 1021 ms, 1027 ms | 197 KB |

The shell PATH change cannot show here (it is packaged only); the next `perf-mac` run shows it.

With four panels, `perf-mac` counted 10 processes on 0.1.9 against 9 on 0.1.8. On Linux the tree is the
main process, Chromium's zygotes, GPU, network service and renderer, one Claude Code per panel, and an
audio service that Chromium starts about a second in: the fresh profile opens the Tour, whose video is the
only media element at start. That process is one per app and does not grow per panel, so it is not a
leak; which process differs between the two Mac runs is not proven here.

Held in CI: the `network` job checks the start-up JS (`app/scripts/startup-size.mjs --max-js-kb 215`)
and fails over it; raise it in `ci.yml` with the reason when a change needs more.

## Idle (2026-10-27)

Four panels open, the window focused and visible, 8 s to settle, then 20 s of nothing, measured by
`app/scripts/perf-idle.mjs` on the built app under xvfb (Linux container, no GPU). Layouts and style
recalcs are CDP `Performance.getMetrics` deltas; timers and rAF callbacks are counted by call site
from the page's first script on (an init script, installed by reloading once); IPC is counted in the
main process both ways (`send`, `ipc-message`, and every `invoke` handler); main CPU is
`process.cpuUsage()` over the window.

| Per second, idle | Before | After |
|---|---|---|
| Layouts | 0 | 0 |
| Style recalcs | 0 | 0 |
| rAF callbacks | 0 | 0 |
| setTimeout callbacks | 0 | 0 |
| setInterval callbacks | 0.25 | 0.25 |
| IPC, renderer to main | 0.15 (`spotify:now`) | 0.15 (`spotify:now`) |
| IPC, main to renderer | 0 | 0 |
| Renderer task time | 4.5 ms | 3.9 to 4.4 ms |
| Main process CPU | 0.73 % | 0.39 to 0.61 % |

The focused, empty idle window was already at zero layouts and recalcs (the start-up pass above
removed the big sources). What is left firing is three slow intervals that do not render: the
Spotify poll (every 8 s), the agenda clock (every 20 s) and the round clock (every 30 s). What this
pass fixed are the states the empty measure does not reach:

- **Agenda clock** re-rendered the agenda every 20 s although it shows minutes; it now renders only
  when the minute changes. It still ticks while hidden, so the notice before a meeting still fires.
- **Spotify poll** (`spotify:now`, an AppleScript run in main on macOS) now skips while the window
  is hidden and asks again the moment it shows; the playing position ticks only while visible.
- **Prompt cache chip** in each panel re-rendered every 15 s while hidden; now frozen while hidden and
  caught up on show.
- **Fan-out clock** ticked every second for as long as the fan-out view was open, even with no attempt
  running (the time it shows only moves for a running attempt); now ticks only while one runs, and
  not while hidden.
- **Terminal command clock** (every 200 ms while a command runs) skips while hidden.
- **Running container dot** in Docker breathed forever (a `box-shadow` animation, a style recalc each
  frame) for as long as a container ran; it holds still while the window is out of focus. Busy marks
  (spinners, a panel's pulse, the streaming caret) keep moving: they say work is going on.

Left as it is: main's 1 s `cuts.poll` tick already slows to 30 s when nobody looks (`quiet()`), CI
polls slow to 5 min, the terminal's 500 ms foreground-process check runs only while a terminal is
open, and the mini player's 1 s time read only while it is open. Chromium already stops rAF and CSS
animations in a hidden window.

Not shown by this measure: under xvfb `win.hide()` leaves `document.visibilityState` at `visible`,
so the hidden-window paths were read in code, not measured; on a Mac they want a `perf-mac` run.

Held in CI: the `network` job runs `perf-idle.mjs --max-layouts-per-s 0.5` (4 panels, 20 s). A
count, not a time; anything that animates or polls into the DOM shows up at 1 per second or more.

    cd app && npm run build && xvfb-run -a node scripts/perf-idle.mjs [--panels 4] [--seconds 20]

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

