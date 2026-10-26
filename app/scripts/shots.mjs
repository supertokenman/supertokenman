// Screens for the site, taken from the real app with a clean profile, the Paper theme and a sample
// project called acme. Needs a build (npm run build) and a display (xvfb-run on Linux).
//   node scripts/shots.mjs ../site/assets/screens
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const out = resolve(process.argv[2] ?? 'out/shots')
mkdirSync(out, { recursive: true })
const here = join(import.meta.dirname, '..')
const base = mkdtempSync(join(tmpdir(), 'stm-shots-'))
// the panel header shows the parent folder: a plain name instead of the temp one
const acme = join(base, 'dev', 'acme')
mkdirSync(join(acme, 'src'), { recursive: true })
writeFileSync(join(acme, 'package.json'), JSON.stringify({ name: 'acme', private: true, scripts: { test: 'vitest run' } }, null, 2))
writeFileSync(join(acme, 'src', 'checkout.ts'), 'export const total = (items: number[]) => items.reduce((a, b) => a + b, 0)\n')
const git = (...a) => execFileSync('git', ['-C', acme, ...a], { stdio: 'ignore' })
git('init', '-q', '-b', 'main')
git('-c', 'user.name=Sample', '-c', 'user.email=sample@example.com', 'add', '.')
git('-c', 'user.name=Sample', '-c', 'user.email=sample@example.com', 'commit', '-qm', 'Checkout totals')

const electron = createRequire(import.meta.url)('electron')
const env = { ...process.env, HOME: base, STM_USER_DATA: join(base, 'profile'), STM_WINDOW: '1280x800' }
const args = [electron, '--no-sandbox', '--remote-debugging-port=9334', here, `--cwd=${acme}`]
const app = process.platform === 'linux' ? spawn('xvfb-run', ['-a', '-s', '-screen 0 1280x800x24', ...args], { env, stdio: 'ignore' }) : spawn(args[0], args.slice(1), { env, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let browser
for (let i = 0; i < 40 && !browser; i++) browser = await chromium.connectOverCDP('http://127.0.0.1:9334').catch(() => sleep(500).then(() => null))
if (!browser) throw new Error('the app did not open its debugging port')
const page = browser.contexts()[0].pages().find((p) => !p.url().startsWith('devtools'))
await page.evaluate(() => {
  localStorage.setItem('stm.theme', 'claude-paper')
  localStorage.setItem('stm.tour.seen', '1')
  localStorage.setItem('stm.intro.last', new Date().toISOString().slice(0, 10))
  const d = new Date()
  localStorage.setItem('stm.brief', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
})
await page.reload()
await page.waitForSelector('.hud', { timeout: 30_000 })
await page.waitForSelector('.splash', { state: 'detached', timeout: 30_000 }).catch(() => undefined)
await sleep(1500)

// a clean window between shots: the data stays, the sheets close
const esc = async () => {
  await page.reload()
  await page.waitForSelector('.hud', { timeout: 30_000 })
  await page.waitForSelector('.splash', { state: 'detached', timeout: 30_000 }).catch(() => undefined)
  await sleep(1200)
}
const palette = async (words) => {
  await page.keyboard.press('Meta+k')
  await sleep(400)
  await page.keyboard.type(words, { delay: 20 })
  await sleep(300)
  await page.keyboard.press('Enter')
  await sleep(1200)
}
const shot = async (name) => {
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log('shot', name)
}

// Memory: facts about acme, from you, from Claude and from a session
for (const [text, origin] of [
  ['Tests run with vitest; the slow ones are tagged and skipped in watch mode.', 'agent'],
  ['Checkout totals are in cents, never floats.', 'you'],
  ['The project moved from pnpm to bun workspaces.', 'you'],
]) await page.evaluate(([t, o]) => window.stm.mi.add('acme', t, o), [text, origin])
await palette('Memory items')
await shot('memory')
await esc()

// Tasks: one task across the panel, with a budget
await page.evaluate(() => window.stm.wt.create('Pix at checkout', 'Pay with Pix on the checkout page; tests green', 2, 's1'))
await palette('Tasks across panels')
await page.locator('.wt-list button, .wt-row').first().click().catch(() => undefined)
await sleep(800)
await shot('agents')
await esc()

// Control: the budget limits (the Isolate popover needs Docker, which a CI machine may not have)
await palette('Budgets')
const limits = page.locator('.sheet input[placeholder="none"]')
await limits.nth(0).fill('50').catch(() => undefined)
await limits.nth(1).fill('120').catch(() => undefined)
await sleep(300)
await shot('control')
await esc()

// personas: each one an initial on a tile of its color
await palette('Personas')
await shot('personas')
await esc()

// the panel alone, with the meter
await shot('panel')

await browser.close().catch(() => undefined)
app.kill()
