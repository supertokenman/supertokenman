// Opens the built app (not packaged) with N panels, lets it settle, then records what an idle window
// does for --seconds: layouts/s and style recalcs/s (CDP Performance.getMetrics deltas), timer and
// requestAnimationFrame callbacks fired per second in the renderer, IPC messages per second both ways,
// and main-process CPU. With --max-layouts-per-s, fails above that rate (the CI guard: a count, not a
// time, so a slow runner does not fail it). Needs a display (xvfb-run on Linux).
//
//   xvfb-run -a node scripts/perf-idle.mjs [--panels 4] [--seconds 20] [--settle 8] [--max-layouts-per-s 0.5]
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { mockServer } from './proof-mock-api.mjs'

const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const panels = Number(opt('--panels') ?? 4)
const seconds = Number(opt('--seconds') ?? 20)
const settle = Number(opt('--settle') ?? 8)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mock = mockServer(() => undefined)
await new Promise((ok) => mock.listen(0, '127.0.0.1', ok))
const root = mkdtempSync(join(tmpdir(), 'stm-idle-'))
const project = join(root, 'p')
mkdirSync(project)
writeFileSync(join(project, 'README.md'), '# p\n')
const env = { ...process.env, HOME: join(root, 'home'), STM_USER_DATA: join(root, 'ud'), STM_TEST_SECRETS: '1', ANTHROPIC_BASE_URL: `http://127.0.0.1:${mock.address().port}`, ANTHROPIC_API_KEY: 'proof-mock-key', CLAUDE_CONFIG_DIR: join(root, 'claude') }
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_')) delete env[k]
const app = await electron.launch({ args: ['--no-sandbox', new URL('..', import.meta.url).pathname, `--cwd=${project}`], env })
// Renderer: count timer and rAF callbacks by call site from the page's first script on, so intervals
// armed at start are seen too. Installed before the page's own code by reloading once.
const counter = () => {
  const s = (window.__idle = { installed: true, timeouts: 0, intervals: 0, rafs: 0, sources: {} })
  const where = () => ((new Error().stack ?? '').split('\n')[3] ?? '?').trim().replace(/\?[^:)]*/, '').slice(-90)
  const bump = (k, w) => { s[k]++; s.sources[k + ' ' + w] = (s.sources[k + ' ' + w] ?? 0) + 1 }
  const st = window.setTimeout, si = window.setInterval, raf = window.requestAnimationFrame
  window.setTimeout = (f, ...a) => { const w = where(); return st((...x) => { bump('timeouts', w); return typeof f === 'function' ? f(...x) : undefined }, ...a) }
  window.setInterval = (f, ...a) => { const w = where(); return si((...x) => { bump('intervals', w); return typeof f === 'function' ? f(...x) : undefined }, ...a) }
  window.requestAnimationFrame = (f) => { const w = where(); return raf((t) => { bump('rafs', w); f(t) }) }
}
let win = null
for (let i = 0; i < 120 && !win; i++) { win = app.windows().find((w) => w.url().includes('index.html')) ?? null; if (!win) await sleep(500) }
await win.waitForSelector('.composer textarea', { timeout: 60_000 })
await win.context().addInitScript(counter)
await win.reload()
await win.waitForSelector('.composer textarea', { timeout: 60_000 })
for (let i = 0; i < 3 && (await win.$('.tour-steps')); i++) { await win.keyboard.press('Escape'); await sleep(400) }
// Cmd+T, as the app's own key handler sees it on any platform
for (let i = 1; i < panels; i++) { await win.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', metaKey: true, bubbles: true }))); await sleep(1500) }
// focused and visible, as a user's idle window would be: the worst case for "pause when hidden"
await win.click('.composer textarea').catch(() => undefined)
await sleep(settle * 1000)

// Renderer: reset the counters the init script keeps, and note what the page thinks it is
const page = await win.evaluate(() => { const s = window.__idle ?? {}; s.timeouts = s.intervals = s.rafs = 0; s.sources = {}; window.__idle = s; return { visibility: document.visibilityState, focus: document.hasFocus(), counting: !!s.installed } })
// Main: count IPC both ways, and the main process's own CPU
await app.evaluate(({ BrowserWindow, ipcMain }) => {
  const s = (globalThis.__idle = { toRenderer: 0, fromRenderer: 0, channels: {} })
  const bump = (k, ch) => { s[k]++; s.channels[k + ' ' + ch] = (s.channels[k + ' ' + ch] ?? 0) + 1 }
  for (const w of BrowserWindow.getAllWindows()) {
    const wc = w.webContents
    const send = wc.send.bind(wc)
    wc.send = (ch, ...a) => { bump('toRenderer', ch); return send(ch, ...a) }
    wc.on('ipc-message', (_e, ch) => bump('fromRenderer', ch))
    wc.on('ipc-message-sync', (_e, ch) => bump('fromRenderer', ch))
  }
  // invoke() emits neither event: wrap the registered handlers
  const h = ipcMain._invokeHandlers
  if (h instanceof Map) for (const [ch, fn] of h) h.set(ch, (...a) => { bump('fromRenderer', ch); return fn(...a) })
  s.cpu0 = process.cpuUsage(); s.t0 = Date.now()
})
const cdp = await win.context().newCDPSession(win)
await cdp.send('Performance.enable')
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
const m0 = await metrics()
await sleep(seconds * 1000)
const m1 = await metrics()
const rs = await win.evaluate(() => window.__idle)
const ms = await app.evaluate(() => { const s = globalThis.__idle; const c = process.cpuUsage(s.cpu0); return { ...s, cpuPct: (c.user + c.system) / 1000 / (Date.now() - s.t0) * 100 } })
const ps = (k, f = 1) => Math.round(((m1[k] - m0[k]) * f / seconds) * 100) / 100
const per = (n) => Math.round((n / seconds) * 100) / 100
const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${per(v)}/s ${k}`)
const r = {
  panels: (await win.$$('.panel')).length, seconds, page,
  perS: { layouts: ps('LayoutCount'), recalcs: ps('RecalcStyleCount'), timeouts: per(rs.timeouts), intervals: per(rs.intervals), rafs: per(rs.rafs), ipcToRenderer: per(ms.toRenderer), ipcFromRenderer: per(ms.fromRenderer), rendererTaskMsPerS: ps('TaskDuration', 1000) },
  mainCpuPct: Math.round(ms.cpuPct * 100) / 100,
  sources: top(rs.sources), channels: top(ms.channels),
}
console.log(JSON.stringify(r, null, 2))
// --max-layouts-per-s 0.5: a guard for CI
const max = opt('--max-layouts-per-s')
const over = max !== undefined && r.perS.layouts > Number(max)
if (over) console.error(`idle: ${r.perS.layouts} layouts per second, more than ${max}: something changes the page while nothing happens`)
await app.close().catch(() => undefined)
mock.close()
process.exit(over ? 1 : 0)
