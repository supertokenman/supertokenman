// Types 200 characters into the composer of the built app (not packaged) and prints the frames: the
// same measure perf-mac.mjs takes on the release, for a before and after on any machine. With
// --profile <file>, also writes a CPU profile of the typing; with --max-layouts-per-key, fails above
// that count (the CI guard). Needs a display (xvfb-run on Linux).
//
//   xvfb-run -a node scripts/perf-typing.mjs [--panels 4] [--throttle 4] [--rounds 7] [--profile typing.cpuprofile]
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { median, TYPING_ROUNDS, TYPING_THROTTLES, perKeyMs, summarizeTyping } from './perf-lib.mjs'
import { mockServer } from './proof-mock-api.mjs'

const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const panels = Number(opt('--panels') ?? 1)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mock = mockServer(() => undefined)
await new Promise((ok) => mock.listen(0, '127.0.0.1', ok))
const root = mkdtempSync(join(tmpdir(), 'stm-typing-'))
const project = join(root, 'p')
mkdirSync(project)
writeFileSync(join(project, 'README.md'), '# p\n')
const env = { ...process.env, HOME: join(root, 'home'), STM_USER_DATA: join(root, 'ud'), STM_TEST_SECRETS: '1', ANTHROPIC_BASE_URL: `http://127.0.0.1:${mock.address().port}`, ANTHROPIC_API_KEY: 'proof-mock-key', CLAUDE_CONFIG_DIR: join(root, 'claude') }
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_')) delete env[k]
const app = await electron.launch({ args: ['--no-sandbox', new URL('..', import.meta.url).pathname, `--cwd=${project}`], env })
let win = null
for (let i = 0; i < 120 && !win; i++) { win = app.windows().find((w) => w.url().includes('index.html')) ?? null; if (!win) await sleep(500) }
await win.waitForSelector('.composer textarea', { timeout: 60_000 })
for (let i = 0; i < 3 && (await win.$('.tour-steps')); i++) { await win.keyboard.press('Escape'); await sleep(400) }
// Cmd+T, as the app's own key handler sees it on any platform
for (let i = 1; i < panels; i++) { await win.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', metaKey: true, bubbles: true }))); await sleep(1500) }
await sleep(3000)
const cdp = await win.context().newCDPSession(win)
if (opt('--profile')) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start') }
await cdp.send('Performance.enable')
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
await win.evaluate(() => {
  const s = (window.__perf = { frames: [], events: [] })
  let last = performance.now()
  const tick = (t) => { s.frames.push(t - last); last = t; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  new PerformanceObserver((l) => { for (const e of l.getEntries()) s.events.push(e.duration) }).observe({ type: 'event', durationThreshold: 16 })
})
await win.click('.composer textarea')
// per-key script and task time at each CPU throttle (1x and 4x by default; --throttle N for one),
// median over rounds: the signal. Longest frame and frames over 16/33 ms are noisy, for reference.
const rate = (n) => cdp.send('Emulation.setCPUThrottlingRate', { rate: n })
const throttles = opt('--throttle') ? [Number(opt('--throttle'))] : TYPING_THROTTLES
const nRounds = Number(opt('--rounds') ?? TYPING_ROUNDS)
const rounds = []
for (const throttle of throttles) {
  await rate(throttle)
  for (let k = 0; k < nRounds; k++) {
    await win.evaluate(() => { window.__perf.frames = []; window.__perf.events = [] })
    const m0 = await metrics()
    await win.keyboard.type('the quick brown fox jumps over the lazy dog, '.repeat(5).slice(0, 200), { delay: 30 })
    await sleep(500)
    const m1 = await metrics()
    const t = await win.evaluate(() => ({ frames: window.__perf.frames.slice(1), events: window.__perf.events }))
    const per = (key) => Math.round(((m1[key] - m0[key]) / 200) * 100) / 100
    rounds.push({ throttle, ...perKeyMs(m0, m1, 200), layouts: per('LayoutCount'), recalcs: per('RecalcStyleCount'), longestFrameMs: Math.round(Math.max(0, ...t.frames)), framesOver16: t.frames.filter((x) => x > 16.7).length, framesOver33: t.frames.filter((x) => x > 33.4).length, frames: t.frames.length, longestInputMs: Math.round(Math.max(0, ...t.events)) })
    await win.keyboard.press('Control+a'); await win.keyboard.press('Backspace'); await sleep(300)
  }
}
await rate(1)
if (opt('--profile')) writeFileSync(opt('--profile'), JSON.stringify((await cdp.send('Profiler.stop')).profile))
const layouts = median(rounds.map((x) => x.layouts))
const r = { panels: (await win.$$('.panel')).length, ...summarizeTyping(rounds, 200), perKeyCounts: { layouts, recalcs: median(rounds.map((x) => x.recalcs)) } }
console.log(JSON.stringify(r))
// --max-layouts-per-key 1.5: a guard for CI. A count, not a time, so a slow runner does not fail it.
const max = opt('--max-layouts-per-key')
const over = max !== undefined && layouts > Number(max)
if (over) console.error(`typing: ${layouts} layouts per key, more than ${max}: something measures the page on every key`)
await app.close().catch(() => undefined)
mock.close()
process.exit(over ? 1 : 0)
