// "An orchestrator with 2 workers on the canvas", end to end: one ui_open_panels call with lead self opens two titled workers,
// marks Lead/Worker, links each to the asking panel and fans them on the canvas. Set TEAM_SHOT to keep a screenshot. Run under xvfb-run.
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

test('ui_open_panels with lead self: titles, roles, links and a fan', { timeout: 300_000 }, async () => {
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
    await win.evaluate(() => document.documentElement.removeAttribute('data-blurred'))
    const p = call('ui_open_panels', { panels: [{ folder: dirs[1], title: 'Worker 1' }, { folder: dirs[2], title: 'Worker 2' }], lead: 'self', layout: 'canvas' })
    // nothing opens before Allow
    await win.getByRole('button', { name: 'Allow' }).waitFor({ timeout: 20_000 })
    assert.equal(await win.locator('.panel-bar').count(), 1)
    await win.getByRole('button', { name: 'Allow' }).click()
    const r = await p
    assert.equal(r.isError, false, r.text)
    await win.waitForSelector('.cv-neuro .edge')
    await win.waitForFunction(() => document.querySelectorAll('.role-mark.worker').length === 2)
    assert.equal(await win.locator('.role-mark.lead').count(), 1)
    assert.equal(await win.locator('.cv-neuro .edge').count(), 2)
    const titles = await win.locator('.panel-title').allTextContents()
    assert.deepEqual(titles.sort(), ['Worker 1', 'Worker 2'])
    // lead on the left, workers to its right, one above the other
    const box = async (sel) => (await win.locator(sel).first().evaluate((el) => el.closest('.cv-card')?.getBoundingClientRect().toJSON() ?? el.getBoundingClientRect().toJSON()))
    await win.waitForTimeout(800)
    const L = await box('.role-mark.lead')
    const ws = await Promise.all(['Worker 1', 'Worker 2'].map((t) => win.locator('.panel-title', { hasText: t }).evaluate((el) => el.closest('.cv-card')?.getBoundingClientRect().toJSON() ?? el.getBoundingClientRect().toJSON())))
    for (const w of ws) assert.ok(w.x > L.x + L.width / 2, `worker right of lead ${JSON.stringify([L, w])}`)
    assert.ok(Math.abs(ws[0].x - ws[1].x) < 2 && ws[1].y > ws[0].y)
    const list = (await call('ui_list_panels', {})).text
    assert.match(list, /\(lead\)/)
    assert.equal([...list.matchAll(/linked to/g)].length, 3)
    await win.getByRole('button', { name: 'Not now' }).click({ timeout: 2000 }).catch(() => undefined)
    if (process.env.TEAM_SHOT) await win.screenshot({ path: process.env.TEAM_SHOT })
  } finally {
    await app.close()
  }
})

test('a lead messages two panels opened without links: tasks show, turns run, replies come back, the team appears', { timeout: 300_000 }, async () => {
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
    await win.evaluate(() => document.documentElement.removeAttribute('data-blurred'))
    const p = call('ui_open_panels', { panels: [{ folder: dirs[1], title: 'Worker 1' }, { folder: dirs[2], title: 'Worker 2' }], layout: 'canvas' })
    await win.getByRole('button', { name: 'Allow' }).click({ timeout: 20_000 })
    const r = await p
    assert.equal(r.isError, false, r.text)
    const ids = [...r.text.matchAll(/(s\d+) "/g)].map((m) => m[1])
    assert.equal(ids.length, 2)
    await win.evaluate((sid) => window.stm.lead.set(sid, true), me)
    await win.waitForSelector('.role-mark.lead')
    const t0 = Date.now()
    const replies = await app.evaluate(async (_e, [me, ids]) => Promise.all(ids.map((id, i) => globalThis.__stmHub.message(me, id, `Task ${i + 1}: say done.`).then((x) => ({ ok: true, x }), (e) => ({ ok: false, x: String(e) })))), [me, ids])
    console.log('replies', JSON.stringify(replies), Date.now() - t0, 'ms')
    for (const x of replies) assert.equal(x.ok, true, x.x)
    for (const [i, id] of ids.entries()) assert.match(await win.locator('.cv-card').filter({ has: win.locator('.panel-title', { hasText: `Worker ${i + 1}` }) }).innerText(), new RegExp(`Task ${i + 1}: say done`))
    await win.waitForSelector('.cv-neuro .edge')
    assert.equal(await win.locator('.cv-neuro .edge').count(), 2)
    assert.equal(await win.locator('.role-mark.worker').count(), 2)
    // the lead's header lists both workers, each a button that focuses it; each worker names its lead
    assert.equal(await win.locator('.team-strip .team-w').count(), 2)
    assert.equal(await win.locator('.role-of').count(), 2)
    await win.locator('.team-strip .team-w').first().click()
    await win.waitForTimeout(600)
    if (process.env.TEAM_SHOT2) await win.screenshot({ path: process.env.TEAM_SHOT2 })
    if (process.env.TEAM_SHOT3) {
      await call('ui_set_layout', { layout: 'grid' })
      await win.getByRole('button', { name: 'Not now' }).click({ timeout: 2000 }).catch(() => undefined)
      await win.waitForTimeout(800)
      await win.screenshot({ path: process.env.TEAM_SHOT3 })
    }
  } finally {
    await app.close()
  }
})

test.after(() => api.close?.())
