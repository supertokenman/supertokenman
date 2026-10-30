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

Start-up JS (gzip): 214.5 KB before, 186.4 KB after the Today, Team, Music, Docker, Spec, Fanout, Issues,
PastSearch, ArchDesk, Learn, SkillDrafts and TryWays sheets moved behind `lazy`. The budget stays at 215 KB.

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

## Size and memory (2026-10-27)

### Size

Every package in `dependencies` was checked against what the builds load: the main process bundle
(`dist-electron/electron/app.mjs`, built by esbuild with `packages: 'external'`, so its imports are
the packages the packaged app needs at run time), the preloads, and `cli/`. All of them are imported
from main except the three xterm addons (`@xterm/addon-search`, `-web-links`, `-webgl`): only
`src/TermView.tsx` imports them, so Vite bundles them into the renderer and the copies in
`node_modules` were shipped in the asar for nothing. They moved to `devDependencies` next to
`@xterm/xterm`. Nothing was unused, so nothing was dropped.

electron-builder now ships only the Chromium locales `en-US`, `en-GB`, `pt-BR`, `pt-PT`, `es` and
`es-419` (`electronLanguages`; the UI is English, Chromium falls back to `en-US`), and leaves out of
the asar, under `node_modules` only, source maps, Markdown, `.d.ts` files and `test`/`tests`/
`__tests__`/`example(s)` folders.

`electron-builder --linux dir`, `release/linux-unpacked`:

| | Before | After |
|---|---|---|
| Whole directory | 633.4 MB | 614.2 MB |
| `app.asar` | 37.9 MB (4755 entries) | 27.1 MB (3677 entries) |
| `locales/` | 9.0 MB (55 files) | 0.7 MB (6 files) |
| `app.asar.unpacked` | 298.7 MB | 298.6 MB |

Most of what is left is the Claude Code binary (`claude-agent-sdk-linux-x64`, 292 MB unpacked),
which the app runs, and Electron itself. The packaged directory still launches under xvfb to a
usable composer. The Mac dmg size is measured per release by `perf-mac`.

### Memory

`app/scripts/perf-memory.mjs` opens the built app with 1 panel, settles 10 s, forces a GC and
measures; opens 3 more (Cmd+T), settles and measures again. Resident memory is the sum of `VmRSS`
over the whole process tree under Electron's main (read from `/proc`; `app.getAppMetrics()` on other
systems), the JS heap is the renderer's `Runtime.getHeapUsage` after a GC. Linux container, xvfb,
three runs:

| | 1 panel | 4 panels | Per panel |
|---|---|---|---|
| Process tree RSS | 1099 to 1131 MB | 1885 to 1964 MB | 262 to 278 MB |
| of which Claude Code (`claude`) | 272 MB | 1082 MB | 270 MB |
| of which the app's own processes | 859 MB | 883 MB | 8 MB |
| Renderer JS heap | 5.4 to 6.0 MB | 6.6 MB | 0.2 to 0.4 MB |

A panel is cheap for the app; nearly all of its cost is the Claude Code process its session runs.
No leak showed up: the heap stays flat after a GC. The fixed part (about 860 MB with one panel) is
Electron's main, GPU, utility and zygote processes and the window's renderer.

Held in CI: the `network` job runs `perf-memory.mjs --max-mb-per-panel 450`.

    cd app && npm run build && xvfb-run -a node scripts/perf-memory.mjs [--settle 10] [--max-mb-per-panel 450]

## Measured on each release

`.github/workflows/perf-mac.yml` runs after each published release, and by hand from the Actions tab
with a tag. On a `macos-latest` runner (Apple silicon) it downloads the released dmg, checks it against
SHA256SUMS, and runs `app/scripts/perf-mac.mjs` on the signed app, driven over Chromium's debugging
port on loopback like the proof. Every launch has a fresh profile; Claude Code talks to the local mock
Anthropic API (`app/scripts/proof-mock-api.mjs`), so there is no key and no network for it.

What it records, against the v1.1 budgets in docs/ROADMAP.md:

- Launch to window shown, and to the composer usable (enabled and taking focus), from process spawn:
  two cold launches recorded on their own, then the median, minimum and maximum of 7 more (since
  0.1.12; before that, the median of 5 including the cold ones). Polled every 50 ms, so a number can be
  up to 50 ms late.
- Idle for 30 s with 1 panel, then with 4: layouts and style recalcs per second (CDP
  `Performance.getMetrics`), CPU and memory of the app and every process under it (`ps` once a
  second), and memory per added panel.
- Typing 200 characters into the composer, 7 rounds at 1x and at a 4x CPU throttle (CDP
  `Emulation.setCPUThrottlingRate`): the primary signal is the median per-key script time and per-key
  task time (CDP `Performance.getMetrics`). Trust these, not the longest frame: in a local Linux xvfb A/B
  of 0.1.20 and 0.1.22 the per-key script time held steady (1.49 vs 1.55 ms; 8.2 vs 8.9 ms at 4x) while
  the longest frame overlapped (67 to 100 ms vs 83 to 133 ms). A previous release without these is shown
  as "new in this version". Older description, now noisy and for reference: three rounds (since 0.1.12; one before), the median round's
  longest frame and frames over 16 and 33 ms (`requestAnimationFrame` gaps), the worst round's longest
  frame, and the longest input to paint (Event Timing). A section measured differently from the previous
  release is left out of the comparison, and PERF.md says so.
- Sizes: renderer JS and CSS in `app.asar`, gzip of the files `index.html` loads at start, the .app
  on disk and the dmg.

The numbers go to `perf.json` and `PERF.md` in the `perf-mac` artifact (30 days), and are attached to
the release as `perf-mac-<version>.md` and `perf-mac-<version>.json`. The next run reads the previous
release's json and adds a comparison; changes over 10% are marked. Nothing fails on a number yet:
budgets come once there are a few releases of numbers. A CI runner is a shared VM, so read single
changes with care; a trend over releases says more.


## Launch regression (2026-10-28)

perf-mac on the signed 0.1.11 showed launch to window shown 2106 ms (0.1.10) to 2948 ms (+40%),
composer usable 2944 to 3052 ms, and typing's longest frame 63 to 109 ms. Nothing in the app got slower;
the measure did.

**Cause: the median of 5 launches included the cold launches.** The per-launch lines in the perf-mac
logs (window / composer, ms):

| Release | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| 0.1.8 | 4680 / 6516 | 4636 / 5741 | 1327 / 2958 | 1167 / 1682 | 1184 / 1647 |
| 0.1.9 | 5018 / 6713 | 4869 / 6143 | 1290 / 1961 | 1215 / 2317 | 1397 / 2385 |
| 0.1.10 | 6561 / 9315 | 2349 / 3001 | 2106 / 2944 | 1778 / 2238 | 1290 / 2121 |
| 0.1.11 | 5104 / 7239 | 5443 / 8356 | 2948 / 3052 | 1697 / 2254 | 1399 / 1912 |

The first one or two launches of a just-installed signed app on a fresh runner take 4.6 to 6.6 s (the
system's first checks of the bundle and a cold disk cache), then it settles. With five runs the median is
run 3, which is wherever the warm-up happened to end: 0.1.10 had one cold run, 0.1.11 had two, so the
median moved from a warm run to the tail of the warm-up. The warm runs 4 and 5 are the same in both
(1778 / 1290 against 1697 / 1399 ms window; 2238 / 2121 against 2254 / 1912 ms composer).

Checked and ruled out, Linux under xvfb:

- Packaged builds (`electron-builder --linux dir`) of v0.1.10 and of main (0.1.11's launch path; PR 50
  and 52 do not touch it), `perf-launch.mjs --runs 7 --app <binary>`, alternated twice: window 876 / 1014
  ms against 966 / 851 ms, composer 1256 / 1131 ms against 1123 / 1131 ms. No difference.
- The splash does not hold the composer: on every launch the composer is usable the same poll it first
  exists (about 1.1 to 1.4 s), well before the full film ends (2 s); the film is `pointer-events: none`
  and nothing disables the textarea. "Window shown" is `document.visibilityState`, which the splash does
  not touch.
- The main process does not wait for the shell PATH before the window: STM_PERF marks put
  "window created" at about 430 to 610 ms and "panel path and office checked" within 1 ms of
  "panel asked"; between 0.1.10 and 0.1.11 `electron/main.ts` changed by one line (prices).
- Typing, `perf-typing.mjs --panels 4 --throttle 4`, three runs each: per key 1.02 layouts, 2.12 style
  recalcs and 3.7 to 4.9 ms of script on both; longest frames 17 / 33 / 33 ms (0.1.10) and 17 / 17 /
  50 ms (main). The same work per key; the longest frame of one run is a single sample of a shared
  machine (0.1.9 had 17 frames over 33 ms, 0.1.10 13, 0.1.11 21).

**Fix: the measure.** perf-mac now records two cold launches on their own (shown, never dropped), then
takes the median, minimum and maximum of 7 more; typing runs three rounds and shows the median round
and the worst round's longest frame. A section measured differently from the previous release is left
out of the comparison and PERF.md names it, so 0.1.12 will not show a false improvement against 0.1.11.
No app code changed.

**Launch guard in CI:** `xvfb-run -a node scripts/perf-launch.mjs --runs 5 --max-composer-ms 4000`
(unpackaged; here the median is about 1.05 s, min 1.0, max 1.1 s). It is loose on purpose for a shared
runner: it catches a launch that starts waiting on something new, not a few percent.

Only perf-mac can confirm: the macOS numbers with the new method (0.1.12's run), whether the cold
launches are Gatekeeper's first check or the disk cache, and whether macOS on a virtual M1 has anything
of its own in the 1.3 to 1.7 s warm launch.

## 0.1.12 on the Mac: slower launch, and the update check (2026-10-28)

perf-mac on the signed 0.1.12 (run 40679328422, new method): launch to composer median 6662 ms (5300 to
12667) after two cold launches (16772 / 22355 and 8059 / 10999 ms window / composer); window shown 4622 ms.
0.1.11's warm runs were 1.4 to 3.0 s window and 1.9 to 3.1 s composer. Idle CPU of the tree went from 1.8
to 3.4 % with one panel. Typing and memory did not move.

What is known:

- Linux under xvfb does not show it: `perf-launch.mjs --runs 5` on this fix's tree gives a median window
  of 866 ms and composer of 1191 ms (min 1085, max 1490), as before 0.1.12. The CI launch guard passed on 0.1.12.
- The only launch-path work that runs only in a signed Mac build is the release update check. The window
  asked for it at mount. That loaded electron-updater (and Squirrel's native updater) in the main process
  and sent releases.atom, releases/latest, the tag page, latest-mac.yml and the asset redirect while the
  window was still starting. 0.1.11 did the same, so this is **not shown** to be the cause of the 3x.
- None of the other changes between 0.1.11 and 0.1.12 (PR 50, 52, 56, 57) runs on the launch path before
  the window. The stm launcher from PR 56 is written when a panel starts, and transcripts only register three IPC handlers.

**Change:** the automatic update check is off on a new install and, when turned on, waits 60 s after the
window is up (`electron/updategate.ts`). None of the updater runs during launch any more. See
docs/security/2026-10-28-mac-0.1.12/REPORT.md for the network side.

Only a new perf-mac run on a signed build can say whether this brings the warm launch back to about 2 s.
If it does not, the next suspects are the runner (image 1000000368 for 0.1.11, then 1000000420) and
Gatekeeper's checks of the larger `app.asar.unpacked` (the stm CLI files added in PR 56), which Linux
cannot show.
