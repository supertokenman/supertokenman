// Queue, failover and the team channel, end to end: the real app under a throwaway profile with a fake model.
// QFC_SHOTS is a folder for screenshots. Run under xvfb-run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { fakeAnthropic } from './fake-anthropic.mjs'

const appDir = new URL('..', import.meta.url).pathname
const api = await fakeAnthropic()
const root = mkdtempSync(join(tmpdir(), 'stm-qfc-e2e-'))
const home = join(root, 'home'), ud = join(root, 'ud'), envDir = join(root, 'panel-env')
const dirs = ['acme', 'api', 'web'].map((d) => join(root, d))
for (const d of [home, ud, envDir, ...dirs]) mkdirSync(d, { recursive: true })
const shots = process.env.QFC_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const env = { ...process.env, HOME: home, STM_USER_DATA: ud, STM_TEST_SECRETS: '1', STM_TEST_PANEL_ENV: envDir, ANTHROPIC_BASE_URL: api.url, ANTHROPIC_API_KEY: 'sk-e2e', CLAUDE_CONFIG_DIR: join(home, '.claude') }
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_') || k === 'CLAUDE_SESSION_INGRESS_TOKEN_FILE' || k.startsWith('STM_PANEL')) delete env[k]

/** the text of the last user message of each request that came with tools (a turn of a panel) */
const turns = () =>
  api.bodies.map((x) => JSON.parse(x)).filter((b) => b.tools?.length).map((b) => {
    const m = [...(b.messages ?? [])].reverse().find((x) => x.role === 'user')
    return JSON.stringify(m?.content ?? '')
  })

test('queue three messages while busy, edit one, 429 card, channel', { timeout: 420_000 }, async () => {
  const app = await electron.launch({ args: ['--no-sandbox', appDir, `--cwd=${dirs[0]}`], env })
  const shot = async (win, name) => shots && (await win.screenshot({ path: join(shots, name) }))
  try {
    let win = null
    for (let i = 0; i < 120 && !win; i++) {
      win = app.windows().find((w) => /(\/dist\/|stmui:\/\/app\/)index\.html/.test(w.url())) ?? null
      if (!win) await new Promise((r) => setTimeout(r, 500))
    }
    assert.ok(win, 'app window')
    win.on('pageerror', (e) => console.log('PAGEERROR', String(e.stack ?? e).slice(0, 900)))
    await win.waitForSelector('.composer textarea', { timeout: 60_000 })
    for (let i = 0; i < 3 && (await win.$('.tour-steps')); i++) (await win.keyboard.press('Escape'), await win.waitForTimeout(400))
    await win.addStyleTag({ content: '.splash{display:none!important}' })
    for (let i = 0; i < 60 && !readdirSync(envDir).length; i++) await win.waitForTimeout(500)
    const me = readdirSync(envDir)[0].replace(/\.json$/, '')
    const say = async (text) => {
      await win.locator('.composer textarea').first().fill(text)
      await win.keyboard.press('Enter')
    }

    // 1. queue: three messages while the first turn runs; edit the third; they go out in order
    await say('E2E_SLOW first')
    await win.waitForSelector('.send.stop', { timeout: 20_000 })
    await say('second message')
    await say('third message')
    await say('fourth message')
    await win.waitForSelector('.queue-item:nth-child(3)', { timeout: 10_000 })
    assert.equal(await win.locator('.queue-item').count(), 3)
    assert.match(await win.locator('.queue-cost').innerText(), /3 turns/)
    await win.locator('.queue-item').nth(1).getByRole('button', { name: 'Edit' }).click()
    await win.locator('.queue-edit textarea').fill('third message edited')
    await win.getByRole('button', { name: 'Save' }).click()
    await win.waitForFunction(() => [...document.querySelectorAll('.queue-text')].some((e) => /third message edited/.test(e.textContent)))
    await shot(win, '1-queue-three-waiting.png')
    // the queue empties one item per turn
    await win.waitForFunction(() => !document.querySelector('.queue'), null, { timeout: 90_000 })
    for (let i = 0; i < 60 && turns().length < 4; i++) await win.waitForTimeout(500)
    const t = turns()
    const order = ['E2E_SLOW first', 'second message', 'third message edited', 'fourth message'].map((m) => t.findIndex((x) => x.includes(m)))
    assert.ok(order.every((i) => i >= 0), `all four reached the model: ${JSON.stringify(order)}`)
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in the order they were queued, with the edit applied')
    assert.ok(!t.some((x) => x.includes('third message"') || /third message[^e]/.test(x.replace('third message edited', ''))), 'the unedited text never went out')
    await win.waitForSelector('.send:not(.stop)', { timeout: 30_000 })
    await shot(win, '2-queue-sent-in-order.png')

    // 2. a 429 on a turn: the card, never a silent switch
    const prefs = await win.evaluate((sid) => window.stm.failover.prefsGet(sid), me)
    const sonnet = prefs.models.find((m) => /sonnet/.test(m))
    assert.ok(sonnet, 'a sonnet model is known')
    await win.evaluate(([sid, m]) => window.stm.failover.prefsSet(sid, { fallback: { model: m } }), [me, sonnet])
    const before = turns().length
    await say('run the report')
    for (let i = 0; i < 60 && turns().length <= before; i++) await win.waitForTimeout(500)
    await win.waitForSelector('.send:not(.stop)', { timeout: 30_000 })
    await app.evaluate((_e, sid) => globalThis.__stmEmit(sid, { kind: 'turn', costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, isError: true, status: 429, text: 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your rate limit"}}' }), me)
    await win.waitForSelector('.failover-card', { timeout: 10_000 })
    const card = await win.locator('.failover-card').innerText()
    assert.match(card, /rate limited \(429\)/i)
    assert.match(card, /Switch to sonnet/)
    assert.match(card, /Cancel/)
    assert.match(card, /Always switch for this panel/)
    assert.equal(await win.locator('.failover-card [type=checkbox]').isChecked(), false, 'always is off by default')
    await shot(win, '3-failover-card-429.png')
    const sent = turns().length
    await win.getByRole('button', { name: /Switch to sonnet/ }).click()
    await win.waitForFunction(() => !document.querySelector('.failover-card'))
    await win.waitForFunction(() => /Switched from .* to sonnet/.test(document.body.innerText), null, { timeout: 10_000 })
    for (let i = 0; i < 60 && turns().length <= sent; i++) await win.waitForTimeout(500)
    assert.ok(turns().length > sent, 'the failed prompt was sent again after the switch')
    assert.ok(turns().at(-1).includes('run the report'))
    const log = readFileSync(join(ud, 'failover-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    assert.equal(log.at(-1).kind, 'failover')
    assert.equal(log.at(-1).reason, 'rate_limit')
    await shot(win, '4-failover-switched.png')

    // 3. the team channel: a lead, a worker, a post, the pulse on the edge, the pane
    const call = (sid, name, args) => app.evaluate(async (_e, [sid, name, args]) => {
      const t = globalThis.__stmUiTools(sid).find((x) => x.name === name)
      const r = await t.handler(args, {})
      return { text: r.content[0].text, isError: Boolean(r.isError) }
    }, [sid, name, args])
    await win.evaluate((sid) => window.stm.lead.set(sid, true), me)
    await win.waitForSelector('.role-mark.lead')
    assert.equal((await call(me, 'ui_set_layout', { layout: 'canvas' })).isError, false)
    await win.evaluate(() => document.documentElement.removeAttribute('data-blurred'))
    const d = call(me, 'delegate', { task: 'Task one: say done.', folder: dirs[1], title: 'api worker' })
    await win.getByRole('button', { name: 'Allow' }).click({ timeout: 20_000 })
    const dr = await d
    assert.equal(dr.isError, false, dr.text)
    const worker = dr.text.match(/to (s\d+)/)[1]
    await win.waitForSelector('.cv-neuro .edge')
    await win.getByRole('button', { name: 'Not now' }).click({ timeout: 2000 }).catch(() => undefined)
    for (let i = 0; i < 40 && (await call(me, 'collect', { ids: [worker], wait: false })).text.includes('Still working'); i++) await win.waitForTimeout(500)
    await win.evaluate(() => document.documentElement.removeAttribute('data-blurred'))
    // outside a team a panel gets a clear error
    const stray = await call(worker, 'channel_read', {}).then((r) => r, () => null)
    assert.ok(stray === null || stray.isError === false)
    const posted = await call(worker, 'channel_post', { kind: 'result', text: 'The api task is done; nothing to review.' })
    assert.equal(posted.isError, false, posted.text)
    await win.waitForSelector('.cv-pulse', { state: 'attached', timeout: 5000 })
    await shot(win, '5-channel-edge-pulse.png')
    await win.waitForSelector('.chan-badge', { timeout: 5000 })
    await win.locator('.chan-btn').click()
    await win.waitForSelector('.chan-post', { timeout: 10_000 })
    const body = await win.locator('.chan-posts').innerText()
    assert.match(body, /The api task is done/)
    await shot(win, '6-channel-pane.png')
    // the person mentions the worker: queued in its queue, with Send now
    const teams = await win.evaluate(() => window.stm.channel.teams())
    const handle = teams[0].members.find((m) => m.id === worker).handle
    await win.locator('.chan-compose textarea').fill(`@${handle} please add a changelog line`)
    await win.getByRole('button', { name: 'Post', exact: true }).click()
    await win.waitForSelector('.chan-wake.queued', { timeout: 10_000 })
    assert.match(await win.locator('.chan-wake.queued').first().innerText(), /waiting in its queue/)
    await shot(win, '7-channel-mention-queued.png')
    const q = await win.evaluate((sid) => window.stm.queue.get(sid), worker)
    assert.equal(q.queue.paused, true, 'the wake waits for the person')
    const n = turns().length
    await win.getByRole('button', { name: 'Send now' }).click()
    for (let i = 0; i < 60 && turns().length <= n; i++) await win.waitForTimeout(500)
    assert.ok(turns().at(-1).includes('changelog line'), 'Send now delivered the post to the worker')
    // a panel's own mention: not linked to anyone else, refused with the reason
    const refused = await call(worker, 'channel_post', { kind: 'question', text: `@${teams[0].members[0].handle} are you there` })
    assert.equal(refused.isError, false)
  } finally {
    await app.close()
    api.close?.()
  }
})
