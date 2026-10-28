// The first-run update question (2026-10-28) on a fresh profile, in the built app: it never shows while
// the splash or the Tour is up, it shows once after, it never takes focus from the composer, and showing
// it saves nothing. Needs a display.
//
//   xvfb-run -a node scripts/update-ask-check.mjs [--shots <dir>]
//
// --shots writes update-ask-dark.png and update-ask-paper.png of the card.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { mockServer } from './proof-mock-api.mjs'

const argv = process.argv.slice(2)
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : undefined
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const electron = createRequire(import.meta.url)('electron')
const mock = mockServer(() => undefined)
await new Promise((ok) => mock.listen(0, '127.0.0.1', ok))
const root = mkdtempSync(join(tmpdir(), 'stm-ask-'))
const project = join(root, 'p')
mkdirSync(project)
writeFileSync(join(project, 'README.md'), '# p\n')
const env = { ...process.env, HOME: join(root, 'home'), STM_USER_DATA: join(root, 'ud'), STM_TEST_SECRETS: '1', ANTHROPIC_BASE_URL: `http://127.0.0.1:${mock.address().port}`, ANTHROPIC_API_KEY: 'proof-mock-key', CLAUDE_CONFIG_DIR: join(root, 'claude') }
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_')) delete env[k]
const port = 9580
const proc = spawn(electron, ['--no-sandbox', new URL('..', import.meta.url).pathname, `--remote-debugging-port=${port}`, `--cwd=${project}`], { env, stdio: 'ignore' })
const fail = []
let browser, win
try {
  while (!browser) { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => undefined); if (!browser) await sleep(50) }
  while (!win) { win = browser.contexts().flatMap((c) => c.pages()).find((p) => /^stmui:|index\.html/.test(p.url())); if (!win) await sleep(50) }
  let overlap = 0, sawSplash = false, sawTour = false, shown = false
  const t0 = Date.now()
  while (!shown && Date.now() - t0 < 60_000) {
    const s = await win.evaluate(() => ({ splash: !!document.querySelector('.splash'), tour: !!document.querySelector('.tour-steps'), ask: !!document.querySelector('.update-ask') })).catch(() => ({}))
    sawSplash ||= Boolean(s.splash)
    sawTour ||= Boolean(s.tour)
    if (s.ask && (s.splash || s.tour)) overlap++
    if (s.tour) { await sleep(1500); await win.keyboard.press('Escape').catch(() => undefined) }
    shown = Boolean(s.ask)
    await sleep(50)
  }
  console.log(`update-ask: splash seen ${sawSplash}, Tour seen ${sawTour}, card shown ${shown}, shown over splash or Tour ${overlap}`)
  if (overlap) fail.push('the card showed over the splash or the Tour')
  if (!shown) fail.push('the card never showed on a fresh profile')
  if (await win.evaluate(() => !!document.activeElement?.closest('.update-ask'))) fail.push('the card took focus')
  if (await win.evaluate(() => window.stm.updateAsked())) fail.push('showing the card saved an answer')
  if (shots && shown) {
    await win.mouse.move(5, 300)
    await sleep(400)
    const card = await win.$('.update-ask')
    const clip = await card.boundingBox()
    const pad = 24
    const area = { x: Math.max(0, clip.x - pad), y: Math.max(0, clip.y - pad), width: clip.width + 2 * pad, height: clip.height + 2 * pad }
    await win.screenshot({ path: join(shots, 'update-consent-dark.png'), clip: area })
    await win.screenshot({ path: join(shots, 'update-consent-dark-window.png') })
    // Paper: the theme is read at start, so set it and reload; the question is still unanswered
    await win.evaluate(() => localStorage.setItem('stm.theme', 'claude-paper'))
    await win.reload()
    await win.waitForSelector('.update-ask', { timeout: 30_000 })
    await win.mouse.move(5, 300)
    await sleep(600)
    await win.screenshot({ path: join(shots, 'update-consent-paper.png'), clip: area })
    await win.screenshot({ path: join(shots, 'update-consent-paper-window.png') })
  }
} finally {
  await browser?.close().catch(() => undefined)
  proc.kill('SIGTERM')
  await sleep(1500)
  proc.kill('SIGKILL')
  mock.close()
}
if (fail.length) { console.error(fail.join('\n')); process.exit(1) }
console.log('update-ask: ok')
process.exit(0)
