// Opens the built app (not packaged) with 1 panel, lets it settle, measures memory, opens 3 more panels
// (Cmd+T), settles again and measures again. Memory is the resident size of the whole process tree
// (Electron's main, renderer, GPU and utility processes plus anything they spawned, read from /proc on
// Linux; app.getAppMetrics() elsewhere) and the renderer's JS heap after a forced GC (CDP). The cost of
// one panel is (4 panels - 1 panel) / 3. On Linux it is also split into the app's own processes and the
// Claude Code CLI ("claude") each panel's session runs, which is most of it. With --max-mb-per-panel, fails above that (the CI guard).
// Needs a display (xvfb-run on Linux).
//
//   xvfb-run -a node scripts/perf-memory.mjs [--settle 10] [--max-mb-per-panel 60]
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { mockServer } from './proof-mock-api.mjs'

const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const settle = Number(opt('--settle') ?? 10)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mb = (b) => Math.round(b / 1024 / 1024 * 10) / 10
const mock = mockServer(() => undefined)
await new Promise((ok) => mock.listen(0, '127.0.0.1', ok))
const root = mkdtempSync(join(tmpdir(), 'stm-mem-'))
const project = join(root, 'p')
mkdirSync(project)
writeFileSync(join(project, 'README.md'), '# p\n')
const env = { ...process.env, HOME: join(root, 'home'), STM_USER_DATA: join(root, 'ud'), STM_TEST_SECRETS: '1', ANTHROPIC_BASE_URL: `http://127.0.0.1:${mock.address().port}`, ANTHROPIC_API_KEY: 'proof-mock-key', CLAUDE_CONFIG_DIR: join(root, 'claude') }
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_')) delete env[k]
const app = await electron.launch({ args: ['--no-sandbox', new URL('..', import.meta.url).pathname, `--cwd=${project}`], env })
const mainPid = app.process().pid

// Linux: every process under the Electron main, by parent pid, VmRSS summed. Elsewhere: Electron's own count.
const procTree = () => {
  const kids = new Map()
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue
    try { const ppid = Number(readFileSync(`/proc/${d}/stat`, 'utf8').replace(/^.*\)\s+\S+\s+/, '').split(' ')[0]); (kids.get(ppid) ?? kids.set(ppid, []).get(ppid)).push(Number(d)) } catch { /* gone */ }
  }
  const out = []
  const walk = (p) => { out.push(p); for (const c of kids.get(p) ?? []) walk(c) }
  walk(mainPid)
  return out
}
const rssOf = (pid) => { try { const m = /VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${pid}/status`, 'utf8')); return m ? Number(m[1]) * 1024 : 0 } catch { return 0 } }
const treeRss = async () => {
  if (process.platform === 'linux') {
    const pids = procTree()
    const by = {}
    for (const p of pids) { let n = '?'; try { const c = readFileSync(`/proc/${p}/cmdline`, 'utf8').split('\0'); n = c.find((a) => a.startsWith('--type='))?.slice(7) ?? c[0].split('/').pop() } catch { /* gone */ } by[n] = Math.round(((by[n] ?? 0) + mb(rssOf(p))) * 10) / 10 }
    return { bytes: pids.reduce((s, p) => s + rssOf(p), 0), processes: pids.length, byProcessMB: by }
  }
  const m = await app.evaluate(({ app }) => app.getAppMetrics().map((x) => x.memory.workingSetSize))
  return { bytes: m.reduce((s, k) => s + k * 1024, 0), processes: m.length }
}

let win = null
for (let i = 0; i < 120 && !win; i++) { win = app.windows().find((w) => w.url().includes('index.html')) ?? null; if (!win) await sleep(500) }
await win.waitForSelector('.composer textarea', { timeout: 60_000 })
for (let i = 0; i < 3 && (await win.$('.tour-steps')); i++) { await win.keyboard.press('Escape'); await sleep(400) }
await win.click('.composer textarea').catch(() => undefined)
const cdp = await win.context().newCDPSession(win)
const measure = async () => {
  await sleep(settle * 1000)
  await cdp.send('HeapProfiler.collectGarbage')
  await sleep(1000)
  const heap = await cdp.send('Runtime.getHeapUsage')
  const t = await treeRss()
  const claude = t.byProcessMB?.claude
  return { panels: (await win.$$('.panel')).length, rssMB: mb(t.bytes), processes: t.processes, ...(t.byProcessMB ? { appRssMB: Math.round((mb(t.bytes) - (claude ?? 0)) * 10) / 10, claudeRssMB: claude ?? 0, byProcessMB: t.byProcessMB } : {}), jsHeapMB: mb(heap.usedSize) }
}
const one = await measure()
for (let i = 1; i < 4; i++) { await win.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', metaKey: true, bubbles: true }))); await sleep(1500) }
const four = await measure()
const added = four.panels - one.panels
const r = {
  one, four,
  perPanel: added > 0 ? { rssMB: Math.round((four.rssMB - one.rssMB) / added * 10) / 10, ...(four.appRssMB !== undefined ? { appRssMB: Math.round((four.appRssMB - one.appRssMB) / added * 10) / 10, claudeRssMB: Math.round((four.claudeRssMB - one.claudeRssMB) / added * 10) / 10 } : {}), jsHeapMB: Math.round((four.jsHeapMB - one.jsHeapMB) / added * 10) / 10 } : null,
}
console.log(JSON.stringify(r, null, 2))
const max = opt('--max-mb-per-panel')
let fail = false
if (added !== 3) { console.error(`memory: expected 4 panels, found ${four.panels}`); fail = max !== undefined }
else if (max !== undefined && r.perPanel.rssMB > Number(max)) { console.error(`memory: ${r.perPanel.rssMB} MB per panel, more than ${max}`); fail = true }
await app.close().catch(() => undefined)
mock.close()
process.exit(fail ? 1 : 0)
