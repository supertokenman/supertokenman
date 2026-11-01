// Pilot (spec-pilot.md) end to end: the real app under a throwaway profile. A panel's Claude lists the
// commands (app_commands), describes one and runs a free command (app_run) through the window; an ask-tier
// command shows a permission card and runs only on Allow; an unknown id and a confirm-tier command in an
// ordinary panel are refused. The window's runner is wave 3, so the test stands in for it: it answers
// pilot:run over the real preload bridge. Run under xvfb-run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { fakeAnthropic } from './fake-anthropic.mjs'

const appDir = new URL('..', import.meta.url).pathname
const api = await fakeAnthropic()
const root = mkdtempSync(join(tmpdir(), 'stm-pilot-e2e-'))
const home = join(root, 'home'), ud = join(root, 'ud'), envDir = join(root, 'panel-env')
const dirs = ['acme', 'api'].map((d) => join(root, d))
for (const d of [home, ud, envDir, ...dirs]) mkdirSync(d, { recursive: true })
const env = { ...process.env, HOME: home, STM_USER_DATA: ud, STM_TEST_SECRETS: '1', STM_TEST_PANEL_ENV: envDir, ANTHROPIC_BASE_URL: api.url, ANTHROPIC_API_KEY: 'sk-e2e', CLAUDE_CONFIG_DIR: join(home, '.claude') }
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_') || k === 'CLAUDE_SESSION_INGRESS_TOKEN_FILE' || k.startsWith('STM_PANEL')) delete env[k]

test('a panel lists, describes and runs app commands; an ask command shows a card', { timeout: 240_000 }, async () => {
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

    // stand-in for the wave 3 runner: answer each pilot:run through the real bridge
    await win.evaluate(() => {
      window.__pilotRuns = []
      window.stm.pilot.onRun((r) => {
        window.__pilotRuns.push({ id: r.id, args: r.args })
        const layout = r.id.startsWith('layout-')
        void window.stm.pilot.result({ callId: r.callId, ok: true, text: `window ran ${r.id}`, ...(layout ? { undo: { kind: 'layout', prev: 'auto' }, after: String(r.args.id) } : {}) })
      })
    })
    const call = (name, args, pilot = false) => app.evaluate(async (_e, [sid, name, args, pilot]) => {
      const t = globalThis.__stmPilotTools(sid, pilot).find((x) => x.name === name)
      const r = await t.handler(args, {})
      return { text: r.content[0].text, isError: Boolean(r.isError) }
    }, [me, name, args, pilot])
    const runs = () => win.evaluate(() => window.__pilotRuns)

    // an ordinary panel sees only free commands; the Pilot sees the ask ones too
    const ordinary = await call('app_commands', {})
    assert.match(ordinary.text, /go-today.*\[free\]/)
    assert.doesNotMatch(ordinary.text, /\[ask\]/)
    const pilot = await call('app_commands', {}, true)
    assert.match(pilot.text, /open-<cwd>.*\[ask\]/)
    assert.match((await call('app_describe', { id: 'layout-<id>' })).text, /Tier: free/)

    // a free command runs at once, through the window, and lands in the actions list with an undo
    const r = await call('app_run', { id: 'layout-grid' })
    assert.equal(r.isError, false, r.text)
    assert.match(r.text, /window ran layout-grid/)
    assert.deepEqual(await runs(), [{ id: 'layout-grid', args: { id: 'grid' } }])
    const actions = await win.evaluate(() => window.stm.pilot.actions())
    assert.equal(actions[0].command, 'layout-grid')
    assert.equal(actions[0].undo, 'layout')

    // refused: not in the catalog, and a command for the person
    assert.equal((await call('app_run', { id: 'policy.rules' })).isError, true)
    assert.equal((await call('app_run', { id: 'go-worktree' })).isError, true)
    // an ordinary panel cannot run an ask command at all
    assert.equal((await call('app_run', { id: 'open-<cwd>', args: { cwd: dirs[1] } })).isError, true)
    assert.equal((await runs()).length, 1)

    // an ask command in the Pilot shows a permission card; Deny runs nothing
    const denied = call('app_run', { id: 'open-<cwd>', args: { cwd: dirs[1] } }, true)
    await win.getByRole('button', { name: 'Deny', exact: true }).first().click({ timeout: 20_000 })
    assert.equal((await denied).isError, true)
    assert.equal((await runs()).length, 1)

    // Allow runs it
    const allowed = call('app_run', { id: 'open-<cwd>', args: { cwd: dirs[1] } }, true)
    await win.locator('.ask-cmd', { hasText: 'Open a panel in a recent folder' }).first().waitFor({ timeout: 20_000 })
    await win.getByRole('button', { name: 'Allow', exact: true }).first().click()
    const ok = await allowed
    assert.equal(ok.isError, false, ok.text)
    assert.equal((await runs()).length, 2)
    assert.equal((await runs())[1].id, `open-${dirs[1]}`)

    // undo is refused while the layout is not what the action left (the stand-in did not really change it) ...
    const id = actions[0].id
    assert.deepEqual(await win.evaluate((id) => window.stm.pilot.undo(id), id), { ok: false, reason: 'changed' })
    // ... and a ui_set_layout lands in the actions list too; once the layout is grid, the undo runs without a card
    const uiLayout = await app.evaluate(async (_e, sid) => (await globalThis.__stmUiTools(sid).find((x) => x.name === 'ui_set_layout').handler({ layout: 'grid' }, {})).content[0].text, me)
    assert.match(uiLayout, /grid/)
    assert.equal((await win.evaluate(() => window.stm.pilot.actions()))[0].command, 'layout-grid')
    assert.deepEqual(await win.evaluate((id) => window.stm.pilot.undo(id), id), { ok: true })
    assert.equal((await runs()).at(-1).id, 'undo')

    // the audit log has a pilot row for each decision, with the tier and the taint flag
    const days = readdirSync(join(ud, 'audit'))
    const rows = readFileSync(join(ud, 'audit', days[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.by === 'pilot')
    assert.ok(rows.some((r) => r.tier === 'free' && r.decision === 'allow'))
    assert.ok(rows.some((r) => r.tier === 'ask' && r.decision === 'ask'))
    assert.ok(rows.every((r) => r.tool === 'mcp__stm__app_run' && typeof r.tainted === 'boolean'))
  } finally {
    await app.close()
    api.close?.()
  }
})
