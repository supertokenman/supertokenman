# The 30 second video

One take of the real app, recorded on the owner's Mac. Every shot below has to happen live; nothing is
mocked, sped up without saying so, or cut to hide a wait. If a turn is slow, keep the slow part and
speed it up with a visible "2x" in the corner.

## Set-up

- The released app (v0.1.5 or later), a clean profile (`STM_USER_DATA=/tmp/stm-demo`), Paper or the
  dark theme, window 1600 x 1000, macOS menu bar hidden.
- A small sample repo with a failing test and a short README, so the tasks are real and quick.
- No real secrets, keys, e-mail or customer names on screen. Notifications off (Focus mode).
- Record with the built-in screen recorder (Cmd+Shift+5), 60 fps, no system audio.

## Shot list

| Time | On screen | Caption (bottom, plain text) |
|---|---|---|
| 0-3 s | The app opens to an empty window; Cmd+N three times; three panels fan out as cards. | Three Claude Code sessions, side by side. |
| 3-9 s | Each panel gets a short task: fix the failing test / update the README / explain a file. Each opens in its own worktree (the folder name shows it). | Each one in its own git worktree. |
| 9-15 s | Panel 1 asks to run `npm test`. The approval appears; the pointer clicks Allow. | Commands wait for you. |
| 15-21 s | The meter in the top bar ticks while the panels work; hover shows the cost of the last turn. | The cost of every turn, as it happens. |
| 21-26 s | Panel 1 finishes: the test passes; the diff opens in the review sheet. | Review the diff before it lands. |
| 26-30 s | End card: the bars mark, "SuperTokenMan", "Free and open source. supertokenman.com", "Not affiliated with Anthropic." | |

## Rules for the captions

- The words in `docs/launch/KIT.md` "Not to say" apply here too: no "secure", "private", "safe" as
  plain adjectives, no user or download numbers.
- Real numbers only: the cost shown is whatever that turn cost.
- English captions; a Portuguese version for LinkedIn uses the same cut with translated captions.

## Export

- `supertokenman-30s.mp4`, H.264, 1920 x 1080, under 15 MB (X and LinkedIn take it without
  re-encoding). Also a 1080 x 1080 crop for LinkedIn.
- Keep the raw recording; the proof posts may link to it.
