// Launches the built app (not packaged) a few times with a fresh profile and prints where start-up
// time goes: the main process's STM_PERF marks, the renderer's own marks (navigation, script, first
// paint, composer), and wall clock from spawn to window and to a usable composer. The same measure as
// perf-mac.mjs takes on the release, for a before and after on any machine. Needs a display.
//
//   xvfb-run -a node scripts/perf-launch.mjs [--runs 5] [--app <packaged binary>] [--max-composer-ms N]
//
// --max-composer-ms fails when the median launch to a usable composer is above N (the CI guard: loose,
// a shared runner is slow, it catches a launch that waits on something new, not a few percent).
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { mockServer } from './proof-mock-api.mjs'
import { median } from './perf-lib.mjs'

const argv = process.argv.slice(2)
const runs = Number(argv[argv.indexOf('--runs') + 1] || 5)
// --app <binary>: a packaged build (electron-builder --linux dir: release/linux-unpacked/<name>)
const maxComposer = argv.includes('--max-composer-ms') ? Number(argv[argv.indexOf('--max-composer-ms') + 1]) : undefined
const packaged = argv.includes('--app') ? argv[argv.indexOf('--app') + 1] : undefined
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const electron = createRequire(import.meta.url)('electron')
const mock = mockServer(() => undefined)
await new Promise((ok) => mock.listen(0, '127.0.0.1', ok))
const all = []
for (let n = 0; n < runs; n++) {
  const root = mkdtempSync(join(tmpdir(), 'stm-launch-'))
  const project = join(root, 'p')
  mkdirSync(project)
  writeFileSync(join(project, 'README.md'), '# p\n')
  const env = { ...process.env, STM_PERF: '1', HOME: join(root, 'home'), STM_USER_DATA: join(root, 'ud'), STM_TEST_SECRETS: '1', ANTHROPIC_BASE_URL: `http://127.0.0.1:${mock.address().port}`, ANTHROPIC_API_KEY: 'proof-mock-key', CLAUDE_CONFIG_DIR: join(root, 'claude') }
  for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_')) delete env[k]
  const port = 9500 + n
  const t0 = performance.now()
  const proc = spawn(packaged ?? electron, ['--no-sandbox', ...(packaged ? [] : [new URL('..', import.meta.url).pathname]), `--remote-debugging-port=${port}`, `--cwd=${project}`], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  const marks = {}
  proc.stdout.on('data', (d) => { for (const m of String(d).matchAll(/\[perf\] (.+?) ([\d.]+)s/g)) marks[m[1]] ??= Number(m[2]) * 1000 })
  let browser, win
  while (!browser) { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => undefined); if (!browser) await sleep(50) }
  while (!win) { win = browser.contexts().flatMap((c) => c.pages()).find((p) => /^stmui:|index\.html/.test(p.url())); if (!win) await sleep(50) }
  let windowMs, composerMs, composerSeenMs
  while (composerMs === undefined && performance.now() - t0 < 90_000) {
    const s = await win.evaluate(() => {
      const ta = document.querySelector('.composer textarea')
      let usable = false
      if (ta && !ta.disabled) { ta.focus(); usable = document.activeElement === ta }
      return { shown: document.visibilityState === 'visible' && document.readyState !== 'loading', seen: Boolean(ta), usable }
    }).catch(() => ({}))
    if (s.shown && windowMs === undefined) windowMs = performance.now() - t0
    if (s.seen && composerSeenMs === undefined) composerSeenMs = performance.now() - t0
    if (s.usable) composerMs = performance.now() - t0
    else await sleep(50)
  }
  // the renderer's own clock, from its navigation start
  const r = await win.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]))
    const res = performance.getEntriesByType('resource').filter((e) => /\.js$/.test(e.name)).map((e) => e.responseEnd)
    return { domInteractive: nav?.domInteractive, scriptsLoaded: Math.max(0, ...res), firstPaint: paint['first-paint'], firstContentfulPaint: paint['first-contentful-paint'], now: performance.now() }
  })
  const one = { windowMs: Math.round(windowMs), composerSeenMs: Math.round(composerSeenMs), composerMs: Math.round(composerMs), main: marks, renderer: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v ?? -1)])) }
  console.log(JSON.stringify(one))
  all.push(one)
  await browser.close().catch(() => undefined)
  proc.kill('SIGTERM')
  await sleep(1500)
  proc.kill('SIGKILL')
}
const spread = (k) => { const v = all.map((a) => a[k]); return `${median(v)} ms (min ${Math.min(...v)}, max ${Math.max(...v)})` }
console.log(`median: window ${spread('windowMs')}, composer ${spread('composerMs')}`)
mock.close()
const med = median(all.map((a) => a.composerMs))
if (maxComposer !== undefined && !(med <= maxComposer)) {
  console.error(`launch to a usable composer: median ${med} ms, above ${maxComposer} ms`)
  process.exit(1)
}
process.exit(0)
