// Pilot (spec-pilot.md) end to end: the real app under a throwaway profile. A panel's Claude lists the
// commands (app_commands), describes one and runs a free command (app_run) through the window; an ask-tier
// command shows a card in the Pilot sheet and runs only on Allow; Undo reverts the layout; an unknown id and
// commands for the person are refused. The window runs the commands itself (src/pilot/run.ts). The
// shortcut opens the sheet; the model is the mock API. Run under xvfb-run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { fakeAnthropic } from './fake-anthropic.mjs'

const appDir = new URL('..', import.meta.url).pathname
const shotsDir = process.env.PILOT_SHOTS
// for the screenshots the mock says something a person would read, in a folder with a readable name
const REPLY = shotsDir ? 'Done. The layout is a grid now and Today is open. You can undo either from the list below.' : 'E2E reply: the panel works.'
const api = await fakeAnthropic(0, { reply: REPLY })
const root = shotsDir ? join(tmpdir(), 'projects') : mkdtempSync(join(tmpdir(), 'stm-pilot-e2e-'))
if (shotsDir) rmSync(root, { recursive: true, force: true })
const home = join(root, 'home'), ud = join(root, 'ud'), envDir = join(root, 'panel-env')
const dirs = ['acme-web', 'billing-api'].map((d) => join(root, d))
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

    // the first panel answers once, so the splash is gone and the window shows a real panel
    await win.getByRole('button', { name: 'Not now' }).click({ timeout: 3000 }).catch(() => undefined)
    await win.locator('.composer textarea').first().fill('hello')
    await win.locator('.composer textarea').first().press('Enter')
    await win.getByText(REPLY).first().waitFor({ timeout: 60_000 })
    await win.locator('.splash').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined)
    const base = await win.locator('.panel').count()
    const notNow = () => win.getByRole('button', { name: 'Not now' }).click({ timeout: 1500 }).catch(() => undefined)
    const shots = process.env.PILOT_SHOTS
    // the sheet only: no panel text of the test in the picture
    const shot = async (name) => shots && (mkdirSync(shots, { recursive: true }), await notNow(), await win.waitForTimeout(500), await win.getByRole('dialog', { name: 'Pilot' }).screenshot({ path: join(shots, `${name}.png`) }))
    const call = (sid, name, args, pilot = false) => app.evaluate(async (_e, [sid, name, args, pilot]) => {
      const t = globalThis.__stmPilotTools(sid, pilot).find((x) => x.name === name)
      const r = await t.handler(args, {})
      return { text: r.content[0].text, isError: Boolean(r.isError) }
    }, [sid, name, args, pilot])

    // the shortcut opens the sheet, which starts its own session
    assert.equal(await win.locator('.pilot:not([hidden])').count(), 0)
    await win.keyboard.press('Meta+Shift+J')
    await win.locator('.pilot:not([hidden])').waitFor({ timeout: 20_000 })
    for (let i = 0; i < 60 && readdirSync(envDir).length < 2; i++) await win.waitForTimeout(500)
    const pilotSid = readdirSync(envDir).map((f) => f.replace(/\.json$/, '')).find((x) => x !== me)
    assert.ok(pilotSid, 'the Pilot session started')
    const sheet = win.getByRole('dialog', { name: 'Pilot' })
    await sheet.getByRole('button', { name: 'Switch to the 2x2 layout' }).waitFor()
    await shot('1-sheet-empty')

    // asking it works through the session (mock API answers)
    await notNow()
    await sheet.getByRole('button', { name: 'Switch to the 2x2 layout' }).click()
    await sheet.getByText(REPLY).waitFor({ timeout: 30_000 })

    // the Pilot runs a layout change and opens a sheet, both free: no card, and the window really changed
    const ordinary = await call(me, 'app_commands', {})
    assert.doesNotMatch(ordinary.text, /\[ask\]/)
    assert.match((await call(pilotSid, 'app_commands', {}, true)).text, /open-<cwd>.*\[ask\]/)
    assert.match((await call(pilotSid, 'app_state', {}, true)).text, /Layout: auto/)
    const lay = await call(pilotSid, 'app_run', { id: 'layout-grid' }, true)
    assert.equal(lay.isError, false, lay.text)
    assert.match((await call(pilotSid, 'app_state', {}, true)).text, /Layout: grid[\s\S]*Open screens: Pilot/)
    const today = await call(pilotSid, 'app_run', { id: 'go-today' }, true)
    assert.equal(today.isError, false, today.text)
    await win.getByRole('dialog', { name: 'Today' }).waitFor()
    assert.match((await call(pilotSid, 'app_state', {}, true)).text, /Open screens: [^\n]*Today/)
    await win.getByRole('dialog', { name: 'Today' }).press('Escape')
    await win.getByRole('dialog', { name: 'Today' }).waitFor({ state: 'detached' })
    const rows = sheet.locator('.pilot-row')
    await rows.first().waitFor()
    assert.equal(await rows.count(), 2)

    // refused: not in the catalog, a command for the person, an ask command in an ordinary panel
    assert.equal((await call(pilotSid, 'app_run', { id: 'policy.rules' }, true)).isError, true)
    assert.equal((await call(pilotSid, 'app_run', { id: 'go-worktree' }, true)).isError, true)
    assert.equal((await call(me, 'app_run', { id: 'open-<cwd>', args: { cwd: dirs[1] } })).isError, true)

    // an ask command shows a card in the sheet; Deny runs nothing
    const denied = call(pilotSid, 'app_run', { id: 'open-<cwd>', args: { cwd: dirs[1] } }, true)
    const card = sheet.getByRole('group', { name: /Confirm: Open a panel/ })
    await card.waitFor({ timeout: 20_000 })
    await card.getByText(dirs[1]).waitFor()
    await shot('3-confirm-card')
    await card.getByRole('button', { name: 'Deny' }).click()
    assert.equal((await denied).isError, true)
    assert.equal(await win.locator('.panel').count(), base)

    // Allow runs it: a second panel opens, and the action can be undone (the panel closes)
    const allowed = call(pilotSid, 'app_run', { id: 'open-<cwd>', args: { cwd: dirs[1] } }, true)
    await card.waitFor({ timeout: 20_000 })
    await card.getByRole('button', { name: 'Allow' }).click()
    const ok = await allowed
    assert.equal(ok.isError, false, ok.text)
    await win.waitForFunction((n) => document.querySelectorAll('.panel').length === n + 1, base)
    assert.equal(await rows.count(), 3)
    await shot('2-actions')
    if (shots && process.env.PILOT_FULL) await win.screenshot({ path: join(shots, '_window.png') })

    // Undo reverts the layout from the list; the row goes, the window changes back
    const layRow = rows.filter({ hasText: 'Change the layout' })
    await layRow.getByRole('button', { name: /Undo/ }).click()
    await layRow.waitFor({ state: 'detached' })
    assert.match((await call(pilotSid, 'app_state', {}, true)).text, /Layout: auto/)
    // Undo last (the keyboard shortcut in the sheet) closes the panel the agent opened
    await sheet.getByLabel('Ask the Pilot').press('Meta+Shift+Z')
    await win.waitForFunction((n) => document.querySelectorAll('.panel').length === n, base)

    // the untrusted badge: once the session has read content the app does not trust, the sheet says so
    assert.equal(await sheet.locator('.pilot-untrusted').count(), 0)
    await app.evaluate((_e, sid) => globalThis.__stmPilotTaint(sid), pilotSid)
    await sheet.getByLabel('Ask the Pilot').fill('Now show me the cost of today')
    await sheet.getByLabel('Ask the Pilot').press('Enter')
    await sheet.locator('.pilot-untrusted').waitFor({ timeout: 30_000 })
    await shot('4-untrusted')

    // the audit log has a pilot row for each decision, with the tier and the taint flag
    const days = readdirSync(join(ud, 'audit'))
    const arows = readFileSync(join(ud, 'audit', days[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.by === 'pilot')
    assert.ok(arows.some((r) => r.tier === 'free' && r.decision === 'allow'))
    assert.ok(arows.some((r) => r.tier === 'ask' && r.decision === 'ask'))
    assert.ok(arows.every((r) => r.tool === 'mcp__stm__app_run' && typeof r.tainted === 'boolean'))
  } finally {
    await app.close()
    api.close?.()
  }
})
