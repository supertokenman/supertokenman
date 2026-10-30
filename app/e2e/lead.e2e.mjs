// The lead panel, end to end: a lead delegates two tasks to workers with a fake model; collect returns their answers.
// Set LEAD_SHOT to a path for the canvas screenshot and LEAD_FRAMES to a directory for pulse frames. Run under xvfb-run.
// (copy of the uitools harness) The ui_* tools of the stm MCP server, end to end: the real app under a throwaway profile; the tools are
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

test('a lead delegates two tasks and the canvas draws the edges', { timeout: 300_000 }, async () => {
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
    await win.addStyleTag({ content: '.splash{display:none!important}' })
    // not a lead yet: refused
    assert.equal((await call('delegate', { task: 'x', folder: dirs[1] })).isError, true)
    await win.evaluate((sid) => window.stm.lead.set(sid, true), me)
    await win.waitForSelector('.role-mark.lead')
    assert.equal((await call('ui_set_layout', { layout: 'canvas' })).isError, false)
    await win.evaluate(() => document.documentElement.removeAttribute('data-blurred'))
    const ids = []
    for (const [i, d] of [dirs[1], dirs[2]].entries()) {
      const p = call('delegate', { task: `Task ${i + 1}: say done.`, folder: d, title: i ? 'web worker' : 'api worker' })
      await win.getByRole('button', { name: 'Allow' }).click({ timeout: 20_000 })
      const r = await p
      assert.equal(r.isError, false, r.text)
      ids.push(r.text.match(/to (s\d+)/)[1])
      if (i === 0 && process.env.LEAD_FRAMES) for (const f of [1, 2, 3]) (await win.waitForTimeout(150), await win.getByRole('button', { name: 'Fit' }).click(), await win.screenshot({ path: `${process.env.LEAD_FRAMES}/pulse-${f}.png` }))
    }
    const got = await call('collect', { ids })
    assert.equal(got.isError, false, got.text)
    assert.match(got.text, /finished|ended with an error/)
    const list = (await call('ui_list_panels', {})).text
    assert.equal([...list.matchAll(/^(s\d+):/gm)].length, 3)
    assert.match(list, /\(lead\)/)
    await win.waitForSelector('.cv-neuro .edge')
    assert.equal(await win.locator('.cv-neuro .edge').count(), 2)
    await win.getByRole('button', { name: 'Not now' }).click({ timeout: 2000 }).catch(() => undefined)
    await win.getByRole('button', { name: 'Fit' }).click()
    await win.waitForTimeout(800)
    if (process.env.LEAD_CPU) {
      await win.waitForTimeout(3000)
      await app.evaluate(({ app }) => app.getAppMetrics())
      await win.waitForTimeout(8000)
      const m = await app.evaluate(({ app }) => app.getAppMetrics().map((x) => x.cpu.percentCPUUsage))
      console.log('idle cpu % per process, 3 panels:', m.map((x) => x.toFixed(1)).join(' '), 'total', m.reduce((a, b) => a + b, 0).toFixed(1))
    }
    if (process.env.LEAD_SHOT) await win.screenshot({ path: process.env.LEAD_SHOT })
  } finally {
    await app.close()
    api.close?.()
  }
})
