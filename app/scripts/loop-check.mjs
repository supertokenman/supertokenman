// Loop detection (2026-10-28) end to end, in the built app with a fake API: every Messages request with
// tools gets the same tool_use back (Read of the README, read-only, so no permission card), and the panel must
// pause after the fourth with the notice and its three buttons; no fifth call goes out. Needs a display.
//
//   npm run build && xvfb-run -a node scripts/loop-check.mjs [--shots <dir>]
//
// --shots writes loop-dark.png of the notice (Show the repeats open); with --theme claude-paper,
// loop-paper.png.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const argv = process.argv.slice(2)
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : undefined
const theme = argv.includes('--theme') ? argv[argv.indexOf('--theme') + 1] : 'claude-dark'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const electron = createRequire(import.meta.url)('electron')

let toolCalls = 0
const mock = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    if (!req.url.startsWith('/v1/messages')) return res.writeHead(200, { 'content-type': 'application/json' }), res.end('{}')
    if (req.url.includes('count_tokens')) return res.writeHead(200, { 'content-type': 'application/json' }), res.end('{"input_tokens":10}')
    const b = JSON.parse(body || '{}')
    if (process.env.LOOP_DEBUG) console.log('req', b.stream, (b.tools ?? []).map((t) => t.name).join(',').slice(0, 300))
    const withTools = Array.isArray(b.tools) && b.tools.some((t) => t.name === 'Read')
    const usage = { input_tokens: 1200, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    if (b.stream !== true) return res.writeHead(200, { 'content-type': 'application/json' }), res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text: 'Loop check' }], stop_reason: 'end_turn', usage }))
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
    const id = `msg_loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    ev('message_start', { message: { id, type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, usage } })
    if (withTools) {
      toolCalls++
      ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: `toolu_${toolCalls}_${Date.now()}`, name: 'Read', input: {} } })
      ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ file_path: join(project, 'README.md') }) } })
      ev('content_block_stop', { index: 0 })
      ev('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 40 } })
    } else {
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Loop check' } })
      ev('content_block_stop', { index: 0 })
      ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } })
    }
    ev('message_stop', {})
    res.end()
  })
})
await new Promise((ok) => mock.listen(0, '127.0.0.1', ok))
const root = mkdtempSync(join(tmpdir(), 'stm-loop-'))
const project = join(root, 'p')
mkdirSync(project)
writeFileSync(join(project, 'README.md'), '# p\n')
const env = { ...process.env, HOME: join(root, 'home'), STM_USER_DATA: join(root, 'ud'), STM_TEST_SECRETS: '1', ANTHROPIC_BASE_URL: `http://127.0.0.1:${mock.address().port}`, ANTHROPIC_API_KEY: 'loop-mock-key', CLAUDE_CONFIG_DIR: join(root, 'claude') }
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k.startsWith('CCR_')) delete env[k]
const port = 9581
const proc = spawn(electron, ['--no-sandbox', new URL('..', import.meta.url).pathname, `--remote-debugging-port=${port}`, `--cwd=${project}`], { env, stdio: 'ignore' })
const fail = []
let browser, win
try {
  while (!browser) { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => undefined); if (!browser) await sleep(50) }
  while (!win) { win = browser.contexts().flatMap((c) => c.pages()).find((p) => /^stmui:|index\.html/.test(p.url())); if (!win) await sleep(50) }
  await win.waitForSelector('.composer textarea', { timeout: 60_000 })
  if (theme !== 'claude-dark') {
    // the theme is read at start: set it and reload before the panel has done anything
    await win.evaluate((t) => localStorage.setItem('stm.theme', t), theme)
    await win.reload()
    await win.waitForSelector('.composer textarea', { timeout: 60_000 })
  }
  for (let i = 0; i < 4 && (await win.$('.tour-steps, .update-ask')); i++) (await win.keyboard.press('Escape'), await sleep(400))
  const ask = await win.$('.update-ask button.ghost')
  if (ask) await ask.click()
  await sleep(4000) // the panel's Claude Code starts
  await win.click('.composer textarea')
  await win.keyboard.type('list the markdown files')
  await win.keyboard.press('Enter')
  await win.waitForSelector('.loop-card', { timeout: 90_000 }).catch(() => fail.push(`the panel never paused with the loop notice (${toolCalls} tool calls answered)`))
  const card = await win.$('.loop-card')
  if (card) {
    const text = await card.innerText()
    console.log(`loop: notice: ${text.replace(/\s+/g, ' ')}`)
    if (!/Paused: the same Read call repeated 4 times\. Those repeats cost about .+ \([\d,]+ tokens\)\./.test(text.replace(/\s+/g, ' '))) fail.push('the notice text is not as expected')
    for (const b of ['Show the repeats', "Continue and don't pause again in this session", 'Continue']) if (!text.includes(b)) fail.push(`no ${b} button`)
    await sleep(2500)
    console.log(`loop: tool calls the API answered: ${toolCalls}`)
    if (toolCalls > 5) fail.push(`the agent kept going after the pause (${toolCalls} calls)`)
    await win.click('.loop-card button:has-text("Show the repeats")')
    if ((await win.$$('.loop-steps li')).length !== 4) fail.push('Show the repeats did not list 4 steps')
    if (shots) {
      const shot = async (name) => {
        await win.mouse.move(5, 300)
        await sleep(400)
        const c = await win.$('.loop-card')
        const box = await c.boundingBox()
        const pad = 24
        await win.screenshot({ path: join(shots, `${name}.png`), clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad } })
        await win.screenshot({ path: join(shots, `${name}-window.png`) })
      }
      await shot(theme === 'claude-dark' ? 'loop-dark' : `loop-${theme.replace(/^claude-/, '')}`)
    }
  }
} finally {
  await browser?.close().catch(() => undefined)
  proc.kill('SIGTERM')
  await sleep(1500)
  proc.kill('SIGKILL')
  mock.close()
}
if (fail.length) { console.error(fail.join('\n')); process.exit(1) }
console.log('loop: ok')
process.exit(0)
