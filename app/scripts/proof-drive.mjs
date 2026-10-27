// Drives the released app for the Mac proof, with nobody at the keyboard. Starts the packaged app with
// its own profile, the proxy and net log flags it is given, and Chromium's debugging port on loopback;
// then, through that port (Playwright's connectOverCDP), does what a person does in proof-mac.sh:
// puts DECOY_KEY in the vault for commands, opens a panel, asks Claude to run `echo hello`, allows the
// command, waits for the reply, and quits. The fuses turn off Node's --inspect, not Chromium's
// debugging port, so the signed build is driven as it ships.
//
//   node scripts/proof-drive.mjs --app <SuperTokenMan.app> --out <dir> [-- <extra app flags>]
//
// Reads the decoy from <out>/decoy.txt. Without ANTHROPIC_API_KEY in the environment it still adds the
// decoy and opens a panel, but sends no message. Writes <out>/drive.json (what happened, never a value)
// and <out>/app.pid. The key is passed to the app only, never written.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const dash = argv.indexOf('--')
const extra = dash >= 0 ? argv.slice(dash + 1) : []
const appDir = opt('--app')
const out = opt('--out')
const port = Number(opt('--port') ?? 9333)
if (!appDir || !out) { console.error('usage: proof-drive.mjs --app <SuperTokenMan.app> --out <dir> [-- flags]'); process.exit(2) }

const decoy = readFileSync(join(out, 'decoy.txt'), 'utf8').trim()
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)
const result = { started: new Date().toISOString(), vault: 'not done', panel: 'not done', claude: 'not done', command: 'not asked', reply: '', steps: [] }
const step = (s) => { result.steps.push(`${new Date().toISOString().slice(11, 19)} ${s}`); console.log(`proof-drive: ${s}`) }
const save = () => writeFileSync(join(out, 'drive.json'), JSON.stringify(result, null, 2) + '\n')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// a project folder for the panel, so it does not open in the runner's home
const project = join(out, 'project')
mkdirSync(project, { recursive: true })
writeFileSync(join(project, 'README.md'), '# proof\n')

const exe = join(appDir, 'Contents', 'MacOS', 'SuperTokenMan')
const args = [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--cwd=${project}`, ...extra]
const app = spawn(exe, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
const log = join(out, 'app.log')
app.stdout.on('data', (d) => appendFileSync(log, d))
app.stderr.on('data', (d) => appendFileSync(log, d))
writeFileSync(join(out, 'app.pid'), String(app.pid))
step(`app started, pid ${app.pid}`)

let browser
try {
  // the debugging port answers once the window process is up
  for (let i = 0; i < 120 && !browser; i++) {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => undefined)
    if (!browser) await sleep(500)
  }
  if (!browser) throw new Error('the debugging port did not answer: this build cannot be driven this way')
  step('connected to the window over loopback')

  let win
  for (let i = 0; i < 120 && !win; i++) {
    win = browser.contexts().flatMap((c) => c.pages()).find((p) => /^stmui:|index\.html/.test(p.url()))
    if (!win) await sleep(500)
  }
  if (!win) throw new Error('no app window')
  await win.waitForSelector('.composer textarea', { timeout: 90_000 })
  // a fresh profile opens the Tour first; close it like a person would
  for (let i = 0; i < 3 && (await win.$('.tour-steps')); i++) { await win.keyboard.press('Escape'); await sleep(400) }
  result.panel = 'open'
  step('panel open')

  // the same call the Vault form's Save makes, with "Commands can read it" ticked
  await win.evaluate(([v]) => window.stm.vaultSet('DECOY_KEY', v, true), [decoy])
  result.vault = 'DECOY_KEY added, commands can read it'
  step('decoy in the vault')

  if (!hasKey) {
    result.claude = 'skipped: no ANTHROPIC_API_KEY in the proof environment'
    step(result.claude)
    await sleep(60_000) // the app still runs a minute with nobody asking, like netwatch
  } else {
    await win.fill('.composer textarea', 'run echo hello and tell me the date')
    await win.click('.composer .send')
    step('message sent')
    result.claude = 'sent'
    // allow every permission card until the turn ends; the reply is done when nothing streams or
    // thinks for 10 seconds and an answer is there
    const deadline = Date.now() + 5 * 60_000
    let quiet = 0
    while (Date.now() < deadline && quiet < 10) {
      const allow = await win.$('.ask .ask-actions .primary')
      if (allow) {
        const what = (await win.textContent('.ask .ask-cmd').catch(() => '')) ?? ''
        await allow.click()
        result.command = `allowed: ${what.trim().slice(0, 200)}`
        step(result.command)
        quiet = 0
      } else if ((await win.$('.caret')) || (await win.$('.thinking')) || !(await win.$('.msg.assistant'))) quiet = 0
      else quiet++
      await sleep(1000)
    }
    const replies = await win.$$eval('.msg.assistant', (els) => els.map((e) => e.textContent ?? ''))
    result.reply = (replies.at(-1) ?? '').replace(decoy, '[decoy]').trim().slice(0, 500)
    result.claude = quiet >= 10 && result.reply ? 'answered' : 'no reply in 5 minutes'
    step(`claude: ${result.claude}`)
    await sleep(5000)
  }
} catch (e) {
  result.error = String(e?.message ?? e).replace(decoy, '[decoy]')
  step(`error: ${result.error}`)
} finally {
  result.ended = new Date().toISOString()
  save()
  await browser?.close().catch(() => undefined) // only drops the debugging connection
}
process.exit(result.error ? 1 : 0)
