// Loads a long transcript (2000 lines: prompts, and replies with markdown, lists and code blocks) into
// a panel of the built app and scrolls it top to bottom, a fixed step per frame, recording every frame.
// Same launch and mock API as perf-typing.mjs. The transcript goes in the way a picked-up past session
// does (a `past` event on chat:event), and every "Show earlier" is opened, so all 2000 lines are drawn.
// With --max-over-33 N and --max-drawn N, fails when more than N frames took over 33 ms or more than N
// messages are drawn after the scroll, and always when a new line does not scroll to the bottom (CI). Needs a display.
//
//   xvfb-run -a node scripts/perf-scroll.mjs [--turns 1000] [--step 120] [--throttle 4] [--profile scroll.cpuprofile] [--trace]
//
// Frames over 16.7 ms are mostly the display's own jitter under xvfb (about a third of frames even with
// 80 lines); --trace adds the main thread's time by trace event (Paint, hit testing, layout), the
// measure that moves with the transcript's size.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { mockServer } from './proof-mock-api.mjs'

const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const turns = Number(opt('--turns') ?? 1000)
const step = Number(opt('--step') ?? 120)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const reply = (i) => [
  `## Step ${i}: what changed`,
  '',
  `The **parser** now reads \`config.${i}.json\` once and keeps it; see [the notes](https://example.com/${i}).`,
  '',
  '- one *thing* that was slow',
  '- another, with `inline code`',
  '- and a third',
  '',
  '```ts',
  `export function step${i}(xs: number[]): number {`,
  '  let total = 0',
  '  for (const x of xs) total += x * 2',
  '  return total',
  '}',
  '```',
  '',
  i % 3 === 0 ? '| col | value |\n| --- | --- |\n| a | 1 |\n| b | 2 |' : `> A quote for turn ${i}.`,
].join('\n')
const past = Array.from({ length: turns }, (_, i) => ({ prompt: `Please look at part ${i} of the code and tell me what to change`, reply: reply(i) }))

const mock = mockServer(() => undefined)
await new Promise((ok) => mock.listen(0, '127.0.0.1', ok))
const root = mkdtempSync(join(tmpdir(), 'stm-scroll-'))
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
await sleep(2000)
const sid = await win.$eval('.panel[data-sid]', (el) => el.getAttribute('data-sid'))
await app.evaluate(({ BrowserWindow }, a) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('chat:event', a.sid, { kind: 'past', turns: a.past, note: 'perf-scroll fixture' }) }, { sid, past })
await win.waitForSelector('.msg.assistant', { timeout: 30_000 })
for (let i = 0; i < 100 && (await win.$('.earlier')); i++) { await win.click('.earlier'); await sleep(50) }
await sleep(1500)
const lines = await win.$$eval('main.scroll .msg', (els) => els.length)

const cdp = await win.context().newCDPSession(win)
if (opt('--throttle')) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opt('--throttle')) })
await win.evaluate(() => { const el = document.querySelector('main.scroll'); el.style.scrollBehavior = 'auto'; el.scrollTop = 0 })
await sleep(1000)
if (opt('--profile')) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start') }
const traced = []
if (argv.includes('--trace')) { cdp.on('Tracing.dataCollected', (e) => traced.push(...e.value)); await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink,cc,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' }) }
await cdp.send('Performance.enable')
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
const m0 = await metrics()
// one step per frame, top to bottom; every frame's length is kept
const t = await win.evaluate((step) => new Promise((done) => {
  const el = document.querySelector('main.scroll')
  const frames = []
  let last = performance.now()
  let y = 0
  const tick = (now) => {
    frames.push(now - last); last = now
    // the page is read for the end only every 30 frames: a read after each write would force a layout
    // in this driver and count against the page
    if (frames.length % 30 === 0 && y >= el.scrollHeight - el.clientHeight - 2) return done({ frames: frames.slice(1), height: el.scrollHeight })
    y += step
    el.scrollTop = y
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}), step)
const m1 = await metrics()
const trace = {}
if (argv.includes('--trace')) { const end = new Promise((r) => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end'); await end; for (const e of traced) if (e.ph === 'X' && e.dur && ['Paint', 'EventHandler::handleMouseMoveEvent', 'ScrollableArea::SetScrollOffset', 'LocalFrameView::UpdateStyleAndLayout', 'FunctionCall'].includes(e.name)) trace[e.name] = (trace[e.name] ?? 0) + e.dur / 1000; for (const k of Object.keys(trace)) trace[k] = Math.round(trace[k] / t.frames.length * 100) / 100 }
if (opt('--profile')) writeFileSync(opt('--profile'), JSON.stringify((await cdp.send('Profiler.stop')).profile))
const d = (k, f = 1) => Math.round((m1[k] - m0[k]) * f)
// still drawn after the scroll (a windowed transcript draws a few screens, not all 2000)
const drawn = await win.$$eval('main.scroll .msg', (els) => els.length)
// stick to bottom: from the top, a new line scrolls the view to the end and is drawn
await win.evaluate(() => { document.querySelector('main.scroll').scrollTop = 0 })
await sleep(500)
await app.evaluate(({ BrowserWindow }, sid) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('chat:event', sid, { kind: 'note', text: 'perf-scroll: the newest line' }) }, sid)
await sleep(3000)
const stuck = await win.evaluate(() => { const el = document.querySelector('main.scroll'); return el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && [...el.querySelectorAll('.notice')].some((n) => n.textContent.includes('perf-scroll: the newest line')) })
const r = { lines, drawn, stuck, heightPx: t.height, frames: t.frames.length, over16: t.frames.filter((x) => x > 16.7).length, over33: t.frames.filter((x) => x > 33.4).length, longestFrameMs: Math.round(Math.max(0, ...t.frames)), layouts: d('LayoutCount'), layoutMs: d('LayoutDuration', 1000), styleMs: d('RecalcStyleDuration', 1000), scriptMs: d('ScriptDuration', 1000), ...(argv.includes('--trace') ? { perFrameMs: trace } : {}) }
console.log(JSON.stringify(r))
// --max-over-33 N: the CI guard. Frames over two vsyncs, with room for a slow shared runner.
const max = opt('--max-over-33')
const maxDrawn = opt('--max-drawn')
const fails = [
  max !== undefined && r.over33 > Number(max) && `${r.over33} frames over 33 ms, more than ${max}`,
  maxDrawn !== undefined && r.drawn > Number(maxDrawn) && `${r.drawn} messages drawn after the scroll, more than ${maxDrawn}: the transcript is not windowed`,
  !r.stuck && 'a new line did not scroll the view to the bottom',
].filter(Boolean)
for (const f of fails) console.error(`scroll: ${f}`)
const over = fails.length > 0
await app.close().catch(() => undefined)
mock.close()
process.exit(over ? 1 : 0)
