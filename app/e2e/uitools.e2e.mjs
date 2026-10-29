// The ui_* tools of the stm MCP server, end to end: the real app under a throwaway profile; the tools are
// called as a panel's Claude would. Opening panels waits for Allow in the sheet. Run under xvfb-run.
// Set UITOOLS_SHOT to a path to keep a screenshot of the canvas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { fakeAnthropic } from './fake-anthropic.mjs'

const appDir = new URL('..', import.meta.url).pathname
const api = await fakeAnthropic()
const root = mkdtempSync(join(tmpdir(), 'stm-ui-e2e-'))
const home = join(root, 'home'), ud = join(root, 'ud'), envDir = join(root, 'panel-env')
const dirs = ['acme', 'api', 'web', 'docs'].map((d) => join(root, d))
for (const d of [home, ud, envDir, ...dirs]) mkdirSync(d, { recursive: true })
const env = { ...process.env, HOME: home, STM_USER_DATA: ud, STM_TEST_SECRETS: '1', STM_TEST_PANEL_ENV: envDir, ANTHROPIC_BASE_URL: api.url, ANTHROPIC_API_KEY: 'sk-e2e', CLAUDE_CONFIG_DIR: join(home, '.claude') }
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_') || k === 'CLAUDE_SESSION_INGRESS_TOKEN_FILE' || k.startsWith('STM_PANEL')) delete env[k]

test('a panel opens a canvas with panels through the ui tools', { timeout: 240_000 }, async () => {
  const app = await electron.launch({ args: ['--no-sandbox', appDir, `--cwd=${dirs[0]}`], env })
  try {
    let win = null
    for (let i = 0; i < 120 && !win; i++) {
      win = app.windows().find((w) => /(\/dist\/|stmui:\/\/app\/)index\.html/.test(w.url())) ?? null
      if (!win) await new Promise((r) => setTimeout(r, 500))
    }
    assert.ok(win, 'app window')
    await win.waitForSelector('.composer textarea', { timeout: 60_000 })
    for (let i = 0; i < 3 && (await win.$('.tour-steps')); i++) (await win.keyboard.press('Escape'), await win.waitForTimeout(400))
    for (let i = 0; i < 60 && !readdirSync(envDir).length; i++) await win.waitForTimeout(500)
    const me = readdirSync(envDir)[0].replace(/\.json$/, '')
    const call = (name, args) => app.evaluate(async (_e, [sid, name, args]) => {
      const t = globalThis.__stmUiTools(sid).find((x) => x.name === name)
      const r = await t.handler(args, {})
      return { text: r.content[0].text, isError: Boolean(r.isError) }
    }, [me, name, args])

    assert.match((await call('ui_set_layout', { layout: 'canvas' })).text, /canvas/)
    assert.equal((await call('ui_set_layout', { layout: 'zig' })).isError, true)
    // a folder that is not there is refused before any sheet
    assert.equal((await call('ui_open_panels', { panels: [{ folder: join(root, 'nope') }] })).isError, true)

    // Deny: nothing opens
    const denied = call('ui_open_panels', { panels: [{ folder: dirs[1] }] })
    await win.getByRole('button', { name: 'Deny' }).first().click({ timeout: 20_000 })
    assert.equal((await denied).isError, true)
    assert.equal(await win.locator('.composer textarea').count(), 1)

    // Allow: one sheet listing the three, then they open
    const opened = call('ui_open_panels', { panels: [{ folder: dirs[1], title: 'API' }, { folder: dirs[2] }, { folder: dirs[3] }], layout: 'canvas' })
    await win.getByRole('dialog', { name: 'Allow panels' }).waitFor({ timeout: 20_000 })
    assert.equal(await win.locator('[aria-label="Allow panels"] li').count(), 3)
    assert.equal(await win.locator('.composer textarea').count(), 1, 'nothing opened before Allow')
    await win.getByRole('button', { name: 'Allow' }).click()
    const r = await opened
    assert.equal(r.isError, false, r.text)
    await win.waitForFunction(() => document.querySelectorAll('.composer textarea').length >= 4, null, { timeout: 30_000 })

    const list = (await call('ui_list_panels', {})).text
    assert.match(list, /Layout: canvas\. 4 panels/)
    const ids = [...list.matchAll(/^(s\d+):/gm)].map((m) => m[1])
    assert.equal(ids.length, 4)
    const link = await call('ui_link_panels', { links: [{ from: ids[0], to: ids[1], mode: 'waits' }, { from: ids[1], to: ids[2], mode: 'waits' }] })
    assert.equal(link.isError, false, link.text)
    assert.match((await call('ui_list_panels', {})).text, /linked to/)
    assert.equal((await call('ui_arrange', { mode: 'grid' })).isError, false)
    await win.waitForTimeout(1500)
    // the fake API never names a model, so the start-up film would stay on top of the shot
    await win.addStyleTag({ content: '.splash{display:none!important}' })
    await win.waitForTimeout(500)
    assert.ok(await win.locator('.cv-links').count(), 'the canvas is on')
    if (process.env.UITOOLS_SHOT) await win.screenshot({ path: process.env.UITOOLS_SHOT })
  } finally {
    await app.close()
    api.close?.()
  }
})
