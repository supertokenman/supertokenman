# Video (9:16 posts)

## Now: Playwright recording

`scripts/export-9x16.js` records one piece of the page at 1080x1920 with Playwright's video, moving the
pointer in a slow loop. Then `ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart out.mp4`.
Rules: silent, under 15 s, real screens only, product name in the last frame held for at least 1 s, key
text inside the central 80% (title-safe), nothing important in the top and bottom 15% where the apps
draw their own chrome.

Real-time recording drops frames when the machine is busy. For smooth output use the deterministic idea
below without adopting a framework: make the piece's animation a pure function of a time value
(`window.__t = 0..1` drives every transform, no `Date.now()`, no unseeded `Math.random()`, no timers),
then step `__t`, `page.screenshot()` each frame to PNG and join with
`ffmpeg -framerate 30 -i f%04d.png -c:v libx264 -pix_fmt yuv420p out.mp4`. (Idea from HyperFrames.)

## Later, if we post often

- **HyperFrames** (HeyGen, Apache-2.0): HTML compositions rendered to video by seeking a paused timeline
  frame by frame. Fits us best: it is HTML/CSS, so site pieces move over almost unchanged. Its contract
  (every timed element declares start and duration; timeline is paused and seeked; no wall-clock time,
  random or network) is worth following even in our own scripts. It runs via `npx` and pulls packages;
  try it in a scratch folder, never inside `site/`.
- **Remotion**: React compositions rendered to video. Strong for data-driven or templated series
  (`useCurrentFrame()`, `interpolate`, `spring`, `<Sequence>`). Costs: React tool chain and Remotion's
  own licence, which requires a paid company licence above a small team size; check before adopting.
  The remotion-dev/skills repo has no licence file, so we took ideas only.

Whatever the tool: compose at 1080x1920, 30 fps, one idea per post, captions burned in only if there is
speech (there is none now), and the same real screenshots and tokens as the site.
