// Measures the released Mac app for v1.1 (docs/ROADMAP.md): launch, idle work with 1 and 4 panels,
// memory, typing, and sizes. Records only; nothing here fails on a number. Drives the signed app the
// way proof-drive.mjs does, over Chromium's debugging port on loopback, with a fresh profile per launch
// and the local mock Anthropic API (proof-mock-api.mjs), so no key and no network for Claude.
//
//   node scripts/perf-mac.mjs --app <SuperTokenMan.app> --out <dir> [--dmg <file>] [--version <v>]
//
// Writes <out>/perf.json and <out>/PERF.md (with <out>/prev-perf.json, when there, compared).
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { mockServer } from './proof-mock-api.mjs'
import * as L from './perf-lib.mjs'

const asar = createRequire(import.meta.url)('@electron/asar')
const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const appDir = opt('--app')
const out = opt('--out')
if (!appDir || !out) { console.error('usage: perf-mac.mjs --app <SuperTokenMan.app> --out <dir> [--dmg <file>] [--version <v>]'); process.exit(2) }
mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8' }).trim() } catch { return '' } }
const say = (s) => console.log(`perf: ${s}`)

const mock = mockServer(() => undefined)
await new Promise((ok) => mock.listen(0, '127.0.0.1', ok))
const apiUrl = `http://127.0.0.1:${mock.address().port}`
const project = join(out, 'project')
mkdirSync(project, { recursive: true })
writeFileSync(join(project, 'README.md'), '# perf\n')

let port = 9400
/** One launch with a fresh profile; resolves when the window can be driven. */
async function launch(n) {
  const home = join(out, `run-${n}`)
  mkdirSync(join(home, 'profile'), { recursive: true })
  const env = { ...process.env, STM_USER_DATA: join(home, 'profile'), CLAUDE_CONFIG_DIR: join(home, 'claude'), ANTHROPIC_BASE_URL: apiUrl, ANTHROPIC_API_KEY: 'proof-mock-key', NO_PROXY: '127.0.0.1,localhost' }
  const p = ++port
  const t0 = performance.now()
  const proc = spawn(join(appDir, 'Contents', 'MacOS', 'SuperTokenMan'), [`--remote-debugging-port=${p}`, '--remote-debugging-address=127.0.0.1', `--cwd=${project}`], { env, stdio: 'ignore' })
  let browser
  while (!browser && performance.now() - t0 < 60_000) {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${p}`).catch(() => undefined)
    if (!browser) await sleep(50)
  }
  if (!browser) throw new Error('the debugging port did not answer')
  let win
  while (!win && performance.now() - t0 < 60_000) {
    win = browser.contexts().flatMap((c) => c.pages()).find((x) => /^stmui:|index\.html/.test(x.url()))
    if (!win) await sleep(50)
  }
  if (!win) throw new Error('no app window')
  let windowMs, composerMs
  while (composerMs === undefined && performance.now() - t0 < 90_000) {
    const s = await win.evaluate(() => {
      const ta = document.querySelector('.composer textarea')
      const shown = document.visibilityState === 'visible' && document.readyState !== 'loading'
      let usable = false
      if (ta && !ta.disabled) { ta.focus(); usable = document.activeElement === ta }
      return { shown, usable }
    }).catch(() => ({ shown: false, usable: false }))
    if (s.shown && windowMs === undefined) windowMs = performance.now() - t0
    if (s.usable) composerMs = performance.now() - t0
    else await sleep(50)
  }
  return { proc, browser, win, windowMs, composerMs }
}
async function quit(l) {
  await l.browser.close().catch(() => undefined)
  l.proc.kill('SIGTERM')
  for (let i = 0; i < 20 && l.proc.exitCode === null; i++) await sleep(250)
  if (l.proc.exitCode === null) l.proc.kill('SIGKILL')
  await sleep(1000)
}
async function closeTour(win) {
  for (let i = 0; i < 3 && (await win.$('.tour-steps')); i++) { await win.keyboard.press('Escape'); await sleep(400) }
}
/** 30 s of nobody doing anything: CDP metric deltas and ps samples of the tree. */
async function idle(l, seconds = 30) {
  const cdp = await l.win.context().newCDPSession(l.win)
  await cdp.send('Performance.enable')
  const before = L.metricsMap(await cdp.send('Performance.getMetrics'))
  const samples = []
  for (let i = 0; i < seconds; i++) {
    samples.push(L.treeUsage(L.parsePs(sh('ps', ['-A', '-o', 'pid=,ppid=,%cpu=,rss='])), l.proc.pid))
    await sleep(1000)
  }
  const after = L.metricsMap(await cdp.send('Performance.getMetrics'))
  await cdp.detach().catch(() => undefined)
  const avg = (k) => samples.reduce((n, s) => n + s[k], 0) / samples.length
  return { ...L.perSecond(before, after, seconds), cpu: avg('cpu'), rssMb: avg('rssMb'), processes: Math.max(...samples.map((s) => s.processes)) }
}

const results = { launch: { runs: 5 }, idle: {}, typing: {}, size: {} }

// ---- launch, 5 times
const w = [], c = []
for (let i = 1; i <= 5; i++) {
  const l = await launch(i)
  w.push(l.windowMs); c.push(l.composerMs)
  say(`launch ${i}: window ${Math.round(l.windowMs)} ms, composer ${Math.round(l.composerMs)} ms`)
  await quit(l)
}
Object.assign(results.launch, { windowMs: L.median(w), composerMs: L.median(c), windowAll: w, composerAll: c })

// ---- idle with 1 then 4 panels, then typing, in one launch
{
  const l = await launch(6)
  await closeTour(l.win)
  await sleep(10_000)
  results.idle.one = await idle(l)
  say(`idle 1 panel: ${JSON.stringify(results.idle.one)}`)
  for (let i = 0; i < 3; i++) { await l.win.keyboard.press('Meta+t'); await sleep(1500) }
  results.idle.panels = await l.win.$$eval('.panel', (els) => els.length)
  await sleep(10_000)
  results.idle.four = await idle(l)
  say(`idle ${results.idle.panels} panels: ${JSON.stringify(results.idle.four)}`)
  results.idle.perPanelMb = results.idle.panels > 1 ? (results.idle.four.rssMb - results.idle.one.rssMb) / (results.idle.panels - 1) : null

  // typing: rAF gaps for frames, Event Timing for input to paint
  await l.win.evaluate(() => {
    const s = (window.__perf = { frames: [], events: [] })
    let last = performance.now()
    const tick = (t) => { s.frames.push(t - last); last = t; if (!s.stop) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    new PerformanceObserver((list) => { for (const e of list.getEntries()) s.events.push(e.duration) }).observe({ type: 'event', durationThreshold: 16, buffered: false })
  })
  await l.win.click('.composer textarea')
  await l.win.keyboard.type('the quick brown fox jumps over the lazy dog, '.repeat(5).slice(0, 200), { delay: 30 })
  await sleep(500)
  const t = await l.win.evaluate(() => { const s = window.__perf; s.stop = true; return { frames: s.frames.slice(1), events: s.events } })
  results.typing = { chars: 200, longestFrameMs: Math.max(0, ...t.frames), framesOver16: t.frames.filter((x) => x > 16.7).length, frames: t.frames.length, longestInputMs: Math.max(0, ...t.events) }
  say(`typing: ${JSON.stringify(results.typing)}`)
  await quit(l)
}

// ---- sizes
const archive = join(appDir, 'Contents', 'Resources', 'app.asar')
const files = asar.listPackage(archive, { isPack: false }).map((f) => f.replace(/^[\\/]/, ''))
const dist = files.filter((f) => /^dist\/.*\.(js|css|mjs)$/.test(f))
const sizeOf = (f) => { try { return asar.statFile(archive, f).size ?? 0 } catch { return 0 } }
const html = asar.extractFile(archive, 'dist/index.html').toString('utf8')
const chunks = L.startupChunks(html).map((r) => `dist/${r}`).filter((f) => files.includes(f))
results.size = {
  distKb: dist.reduce((n, f) => n + sizeOf(f), 0) / 1024,
  startupKb: chunks.reduce((n, f) => n + sizeOf(f), 0) / 1024,
  startupGzipKb: chunks.reduce((n, f) => n + gzipSync(asar.extractFile(archive, f)).length, 0) / 1024,
  appMb: Number(sh('du', ['-sk', appDir]).split(/\s+/)[0]) / 1024,
  dmgMb: opt('--dmg') && existsSync(opt('--dmg')) ? statSync(opt('--dmg')).size / 1024 / 1024 : null,
}
results.size.startupChunks = chunks

mock.close()
const perf = {
  version: opt('--version') || 'unknown',
  system: `${sh('sw_vers', ['-productName'])} ${sh('sw_vers', ['-productVersion'])}`.trim() || process.platform,
  chip: sh('sysctl', ['-n', 'machdep.cpu.brand_string']) || process.arch,
  runner: process.env.RUNNER_NAME ? `${process.env.RUNNER_NAME} (${process.env.ImageOS ?? 'macos'} ${process.env.ImageVersion ?? ''})`.trim() : 'local',
  date: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  results,
}
writeFileSync(join(out, 'perf.json'), JSON.stringify(perf, null, 2) + '\n')
const prevFile = join(out, 'prev-perf.json')
const prev = existsSync(prevFile) ? JSON.parse(readFileSync(prevFile, 'utf8')) : null
writeFileSync(join(out, 'PERF.md'), L.render(perf, prev ? L.compare(prev, perf) : [], prev?.version))
say(`wrote ${join(out, 'PERF.md')}`)
process.exit(0)
