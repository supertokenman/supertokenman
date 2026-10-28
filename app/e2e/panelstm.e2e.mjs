// stm from inside a panel, end to end: the real app under a throwaway profile and a fake API; stm is
// run with the environment the app gave a panel's Claude Code (STM_CLI, STM_SOCKET, STM_PANEL_ID,
// STM_PANEL_KEY, PATH), as Claude's Bash would. Run: npm run test:e2e (on Linux under xvfb-run).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { _electron as electron } from 'playwright'
import { fakeAnthropic } from './fake-anthropic.mjs'

const appDir = new URL('..', import.meta.url).pathname
const api = await fakeAnthropic()
const root = mkdtempSync(join(tmpdir(), 'stm-panel-e2e-'))
const home = join(root, 'home')
const ud = join(root, 'ud')
const envDir = join(root, 'panel-env')
const project = join(root, 'acme')
for (const d of [home, ud, envDir, project]) mkdirSync(d, { recursive: true })
execFileSync('git', ['init', '-q'], { cwd: project })
writeFileSync(join(project, 'README.md'), '# acme\n')

const env = { ...process.env, HOME: home, STM_USER_DATA: ud, STM_TEST_SECRETS: '1', STM_TEST_PANEL_ENV: envDir, ANTHROPIC_BASE_URL: api.url, ANTHROPIC_API_KEY: 'sk-e2e', CLAUDE_CONFIG_DIR: join(home, '.claude') }
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_') || k === 'CLAUDE_SESSION_INGRESS_TOKEN_FILE' || k.startsWith('STM_PANEL')) delete env[k]

const panelEnv = (sid) => JSON.parse(readFileSync(join(envDir, `${sid}.json`), 'utf8'))
/** stm as Claude's Bash in that panel would run it: only the panel's variables on top of a plain shell. */
function stm(penv, args) {
  const r = spawnSync(penv.STM_CLI, [...args, '--json'], { env: { HOME: home, DISPLAY: process.env.DISPLAY ?? '', PATH: penv.PATH, STM_CLI: penv.STM_CLI, STM_SOCKET: penv.STM_SOCKET, STM_PANEL_ID: penv.STM_PANEL_ID, STM_PANEL_KEY: penv.STM_PANEL_KEY }, encoding: 'utf8', timeout: 60_000 })
  const line = r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).at(-1)
  assert.ok(line, `stm ${args.join(' ')} printed JSON (exit ${r.status}; stderr ${r.stderr.slice(0, 400)})`)
  return JSON.parse(line)
}
const composers = (win) => win.$$eval('.composer textarea', (els) => els.map((e) => e.value))

test('a panel drives the app through stm: whoami, spawn, send (queued), identity checked', { timeout: 240_000 }, async () => {
  const app = await electron.launch({ args: ['--no-sandbox', appDir, `--cwd=${project}`], env })
  try {
    let win = null
    for (let i = 0; i < 120 && !win; i++) {
      win = app.windows().find((w) => /(\/dist\/|stmui:\/\/app\/)index\.html/.test(w.url())) ?? null
      if (!win) await new Promise((r) => setTimeout(r, 500))
    }
    assert.ok(win, `app window; got ${app.windows().map((w) => w.url()).join(', ')}`)
    await win.waitForSelector('.composer textarea', { timeout: 60_000 })
    for (let i = 0; i < 3 && (await win.$('.tour-steps')); i++) (await win.keyboard.press('Escape'), await win.waitForTimeout(400))
    for (let i = 0; i < 60 && !readdirSync(envDir).length; i++) await win.waitForTimeout(500)
    const first = readdirSync(envDir)[0].replace(/\.json$/, '')
    const me = panelEnv(first)
    assert.ok(existsSync(me.STM_CLI), 'STM_CLI exists')
    assert.ok(me.PATH.startsWith(join(ud, 'stm-bin')) || me.PATH.includes('stm-bin'), 'the stm folder leads PATH')

    const who = stm(me, ['whoami'])
    assert.equal(who.ok, true, JSON.stringify(who))
    assert.equal(who.data.id, first)
    assert.equal(who.data.project, 'acme')

    // a panel can only act as itself, and unknown ids are refused
    assert.match(stm({ ...me, STM_PANEL_KEY: 'nope' }, ['whoami']).error, /only act as itself/)
    assert.match(stm({ ...me, STM_PANEL_ID: 's999' }, ['whoami']).error, /Unknown panel "s999"/)
    assert.match(stm(me, ['spawn', '--model', 'gpt-5']).error, /Unknown model "gpt-5"/)

    const before = api.bodies.length
    const sp = stm(me, ['spawn', '--prompt', 'please review README'])
    assert.equal(sp.ok, true, JSON.stringify(sp))
    const child = sp.data.id
    await win.waitForFunction(() => document.querySelectorAll('.composer textarea').length >= 2, null, { timeout: 30_000 })
    const links = stm(me, ['links'])
    assert.deepEqual(links.data.map((l) => l.panel), [child])

    const sent = stm(me, ['send', child, 'ping from the first panel'])
    assert.equal(sent.data.delivery, 'queued')
    await win.waitForFunction(() => [...document.querySelectorAll('.composer textarea')].some((t) => t.value.includes('ping from the first panel')), null, { timeout: 10_000 })
    const values = await composers(win)
    const box = values.find((v) => v.includes('ping from the first panel'))
    assert.match(box, /From panel .+: ping from the first panel/)
    assert.match(box, /From panel .+: please review README/)
    // queued, not sent: nothing with it reached the API
    await win.waitForTimeout(1500)
    assert.ok(!api.bodies.slice(before).some((b) => b.includes('ping from the first panel') || b.includes('please review README')), 'never auto-submitted')

    // notes are shared by the project's panels and stay on this machine
    assert.equal(stm(me, ['note', 'set', 'plan', 'step one']).ok, true)
    assert.equal(stm(panelEnv(child), ['note', 'get', 'plan']).data.text, 'step one')
    assert.ok(existsSync(join(project, '.supertokenman', 'notes', 'plan.md')))

    // the actions are in the app's log
    const log = readdirSync(join(ud, 'logs')).map((f) => readFileSync(join(ud, 'logs', f), 'utf8')).join('\n')
    assert.match(log, /\[stm:panel\] .* spawned/)
    assert.match(log, /whoami refused/)
  } finally {
    await app.close().catch(() => undefined)
  }
})

test.after(() => api.close())
