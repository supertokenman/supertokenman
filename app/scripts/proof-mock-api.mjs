// A local stand-in for the Anthropic Messages API, for the Mac proof without a real key. Claude Code
// talks to it through ANTHROPIC_BASE_URL; it asks once for the Bash tool to run `echo hello && date`,
// then answers in text. Every request, with its full body, goes to <run dir>/mock-requests.jsonl, so the
// proof can show every byte Claude Code sent. The key it gets is a fixed fake and is masked anyway.
//
//   node scripts/proof-mock-api.mjs <run dir>     # writes the port to <run dir>/mock-port.txt
import { createServer } from 'node:http'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const COMMAND = { command: 'echo hello && date', description: 'Print hello and the date' }
export const FINAL_TEXT = 'hello, and the date above'

const SECRET_HEADERS = /^(x-api-key|authorization|proxy-authorization|cookie)$/i
export const maskHeaders = (h) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, SECRET_HEADERS.test(k) ? '[masked]' : v]))

/** The answer for one Messages request: a tool_use for Bash first, text once a tool_result is back. */
export function replyFor(body) {
  const tools = Array.isArray(body?.tools) ? body.tools : []
  if (!tools.length) return { kind: 'text', text: 'Proof' } // titles, summaries and other side calls
  const msgs = Array.isArray(body?.messages) ? body.messages : []
  const last = [...msgs].reverse().find((m) => m?.role === 'user')
  const hasResult = Array.isArray(last?.content) && last.content.some((c) => c?.type === 'tool_result')
  if (hasResult) return { kind: 'text', text: FINAL_TEXT }
  const bash = tools.find((t) => t?.name === 'Bash') ?? tools.find((t) => /bash/i.test(String(t?.name)))
  if (!bash) return { kind: 'text', text: 'No Bash tool was offered.' }
  return { kind: 'tool', name: bash.name, input: COMMAND }
}

const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const json = (res, obj) => (res.writeHead(200, { 'content-type': 'application/json' }), res.end(JSON.stringify(obj)))

export function mockServer(log) {
  let n = 0
  return createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      log({ t: new Date().toISOString(), method: req.method, path: req.url, headers: maskHeaders(req.headers), bytes: Buffer.byteLength(raw), body: raw })
      const path = String(req.url).split('?')[0]
      if (path.endsWith('/count_tokens')) return json(res, { input_tokens: 10 })
      if (req.method !== 'POST' || !path.endsWith('/v1/messages')) return json(res, {})
      let body = {}
      try { body = JSON.parse(raw || '{}') } catch { /* answer anyway */ }
      const r = replyFor(body)
      const id = `msg_proof_${++n}`
      const block = r.kind === 'tool' ? { type: 'tool_use', id: `toolu_proof_${n}`, name: r.name, input: r.input } : { type: 'text', text: r.text }
      const stop = r.kind === 'tool' ? 'tool_use' : 'end_turn'
      const model = body.model ?? 'claude-proof'
      if (body.stream !== true) return json(res, { id, type: 'message', role: 'assistant', model, content: [block], stop_reason: stop, stop_sequence: null, usage })
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      ev('message_start', { message: { id, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage } })
      if (r.kind === 'tool') {
        ev('content_block_start', { index: 0, content_block: { ...block, input: {} } })
        ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(r.input) } })
      } else {
        ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
        ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: r.text } })
      }
      ev('content_block_stop', { index: 0 })
      ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } })
      ev('message_stop', {})
      res.end()
    })
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2]
  if (!dir) { console.error('usage: proof-mock-api.mjs <run dir>'); process.exit(2) }
  const file = join(dir, 'mock-requests.jsonl')
  writeFileSync(file, '')
  const server = mockServer((e) => appendFileSync(file, JSON.stringify(e) + '\n'))
  server.listen(0, '127.0.0.1', () => {
    writeFileSync(join(dir, 'mock-port.txt'), String(server.address().port))
    console.log(`proof-mock-api: listening on 127.0.0.1:${server.address().port}`)
  })
}
