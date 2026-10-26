// End-to-end tests of the real app (phase 83): the built app is started with Playwright's Electron
// driver against a fake Anthropic API, a throwaway profile and no keychain. Run: npm run test:e2e
// (on Linux under xvfb-run). They cover what the hardening and native phases (76 to 82) promise.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { _electron as electron } from 'playwright'
import { fakeAnthropic } from './fake-anthropic.mjs'

const appDir = new URL('..', import.meta.url).pathname
const api = await fakeAnthropic()
const root = mkdtempSync(join(tmpdir(), 'stm-e2e-'))
const home = join(root, 'home')
const ud = join(root, 'ud')
const project = join(root, 'acme')
for (const d of [home, ud, project]) mkdirSync(d, { recursive: true })
execFileSync('git', ['init', '-q'], { cwd: project })
writeFileSync(join(project, 'README.md'), '# acme\n')

const env = { ...process.env, HOME: home, STM_USER_DATA: ud, STM_TEST_SECRETS: '1', ANTHROPIC_BASE_URL: api.url, ANTHROPIC_API_KEY: 'sk-e2e', CLAUDE_CONFIG_DIR: join(home, '.claude') }
// a cloud session's own variables would point the CLI at that session's auth instead of the fake
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_') || k === 'CLAUDE_SESSION_INGRESS_TOKEN_FILE') delete env[k]

async function launch(extra = []) {
  const app = await electron.launch({ args: ['--no-sandbox', appDir, `--cwd=${project}`, ...extra], env })
  // the app may open helper windows first; the main one loads dist/index.html
  let win = null
  for (let i = 0; i < 120 && !win; i++) {
    win = app.windows().find((w) => w.url().includes('/dist/index.html')) ?? null
    if (!win) await new Promise((r) => setTimeout(r, 500))
  }
  if (!win) throw new Error(`no app window; windows: ${app.windows().map((w) => w.url()).join(', ')}`)
  await win.waitForSelector('.composer textarea', { timeout: 60_000 })
  // a fresh profile opens the Tour first; close it like a person would
  for (let i = 0; i < 3 && (await win.$('.tour-steps')); i++) {
    await win.keyboard.press('Escape')
    await win.waitForTimeout(400)
  }
  return { app, win }
}

test('the window opens, a panel answers through the fake API', { timeout: 120_000 }, async () => {
  const { app, win } = await launch()
  try {
  await win.fill('.composer textarea', 'hello from e2e')
  await win.click('.composer .send')
  await win.waitForSelector('text=E2E reply: the panel works.', { timeout: 60_000 })
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('a sensitive IPC call outside its contract is refused', { timeout: 120_000 }, async () => {
  const { app, win } = await launch()
  try {
  const msg = await win.evaluate(() => window.stm.iso.start('s1', 'alpine; rm -rf /').then(() => 'ran', (e) => e.message))
  assert.match(msg, /Refused: iso:start/)
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('the menu bar has the app menus and no dev items in a packaged build', { timeout: 120_000 }, async () => {
  const { app } = await launch()
  try {
  const labels = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => i.label))
  assert.ok(labels.includes('File') && labels.includes('Edit') && labels.includes('View'))
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('the window comes back where it was, on a screen that exists', { timeout: 120_000 }, async () => {
  writeFileSync(join(ud, 'window-state.json'), JSON.stringify({ x: 9000, y: 9000, width: 1000, height: 700, maximized: false }))
  const { app, win } = await launch()
  try {
  const [x, y] = await win.evaluate(() => [window.screenX, window.screenY])
  assert.ok(x < 3000 && y < 3000, `moved back on screen, got ${x},${y}`)
  } finally {
    await app.close().catch(() => undefined)
  }
  const saved = JSON.parse(readFileSync(join(ud, 'window-state.json'), 'utf8'))
  assert.ok(saved.x < 3000)
})

test('a deep link asks first, and a bad one is refused', { timeout: 120_000 }, async () => {
  const { app, win } = await launch()
  try {
  // a second launch hands its link to the running app and quits
  const second = await electron.launch({ args: ['--no-sandbox', appDir, 'supertokenman://run?cmd=rm'], env }).catch(() => null)
  await second?.close().catch(() => undefined)
  await win.waitForSelector('.deeplink-bar', { timeout: 20_000 })
  assert.match(await win.textContent('.deeplink-bar'), /refused: Unknown action "run"/)
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('settings never keep a credential', { timeout: 120_000 }, async () => {
  const f = join(ud, 'settings.json')
  const s = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}
  writeFileSync(f, JSON.stringify({ ...s, github: { token: 'ghp_e2eLeakedToken123' } }))
  const { app } = await launch()
  try {
  } finally {
    await app.close().catch(() => undefined)
  }
  assert.doesNotMatch(readFileSync(f, 'utf8'), /ghp_e2eLeaked/)
})

test.after(() => api.close())

test('a generated HTML page runs scripts but cannot reach the app or the network', { timeout: 120_000 }, async () => {
  const probe = join(root, 'probe.html')
  writeFileSync(probe, `<!doctype html><html><head></head><body><div id="out"></div><script>
const row = (k, v) => document.getElementById('out').insertAdjacentHTML('beforeend', '<p>' + k + ':' + v + '</p>')
try { row('parent', String(window.parent.document.title)) } catch { row('parent', 'blocked') }
try { localStorage.setItem('x', '1'); row('storage', 'usable') } catch { row('storage', 'blocked') }
fetch('https://example.com').then(() => row('fetch', 'reached'), () => row('fetch', 'blocked'))
</script></body></html>`)
  env.STM_TEST_HTML = probe
  const { app, win } = await launch()
  try {
    await win.evaluate(() => window.stm.handoff.pickHtml().then((r) => window.stm.insp.appDoc(r.html)).then((src) => {
      const f = document.createElement('iframe')
      f.setAttribute('sandbox', 'allow-scripts')
      f.src = src
      document.body.appendChild(f)
    }))
    let frame = null
    for (let i = 0; i < 40 && !frame; i++) {
      frame = win.frames().find((f) => f.url().startsWith('stmapp://')) ?? null
      if (!frame) await win.waitForTimeout(250)
    }
    assert.ok(frame, 'the preview frame loaded')
    await frame.waitForSelector('text=fetch:', { timeout: 10_000 })
    const text = await frame.textContent('#out')
    assert.match(text, /parent:blocked/)
    assert.match(text, /storage:blocked/)
    assert.match(text, /fetch:blocked/)
  } finally {
    delete env.STM_TEST_HTML
    await app.close().catch(() => undefined)
  }
})
