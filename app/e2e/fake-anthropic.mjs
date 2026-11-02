// A stand-in for the Anthropic API for end-to-end tests: every message gets the same short reply,
// streamed the way the real API streams. No network, no key.
import { createServer } from 'node:http'

export function fakeAnthropic(port = 0) {
  const bodies = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (!req.url.startsWith('/v1/messages')) return res.writeHead(200, { 'content-type': 'application/json' }), res.end('{}')
      if (req.url.includes('count_tokens')) return res.writeHead(200, { 'content-type': 'application/json' }), res.end('{"input_tokens":10}')
      const b = JSON.parse(body || '{}')
      bodies.push(body)
      if (b.stream !== true) return res.writeHead(200, { 'content-type': 'application/json' }), res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 1 } }))
      // a message that carries E2E_SLOW is answered after a pause, so a test can queue messages while the turn runs
      const last = JSON.stringify([...(b.messages ?? [])].reverse().find((m) => m.role === 'user') ?? '')
      const pause = b.tools?.length && last.includes('E2E_SLOW') ? 4000 : 0
      // a message that carries E2E_HANG is never answered: the panel's process runs, its turn never starts
      if (b.tools?.length && last.includes('E2E_HANG') && !last.includes('E2E_TOOLS')) return
      setTimeout(() => answer(b, res), pause)
    })
  })
  function answer(b, res) {
    // a user message carrying E2E_TOOLS <json array of steps, each an array of {name, input}> E2E_END gets each step's tool
    // calls (in parallel) as the next replies, one step per round trip; after the last step's results the turn ends with text
    const msgs = b.messages ?? []
    const flat = (c) => (typeof c === 'string' ? c : (c ?? []).map((x) => (x.type === 'text' ? x.text : '')).join(' '))
    const at = msgs.findLastIndex((x) => x.role === 'user' && flat(x.content).includes('E2E_TOOLS '))
    const spec = at >= 0 && b.tools?.length ? /E2E_TOOLS (.*?) E2E_END/s.exec(flat(msgs[at].content)) : null
    const steps = spec ? JSON.parse(spec[1]) : []
    const done = msgs.slice(at + 1).filter((x) => x.role === 'assistant').length
    const calls = steps[done]
    const m = Boolean(spec && calls)
    if (m) {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      ev('message_start', { message: { id: 'msg_e2e_t', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } })
      calls.forEach((c, i) => {
        ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: `toolu_e2e_${Date.now()}_${i}`, name: c.name, input: {} } })
        ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(c.input) } })
        ev('content_block_stop', { index: i })
      })
      ev('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 8 } })
      ev('message_stop', {})
      return res.end()
    }
    {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      const text = b.tools?.length ? 'E2E reply: the panel works.' : 'E2E title'
      ev('message_start', { message: { id: 'msg_e2e', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } })
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })
      ev('content_block_stop', { index: 0 })
      ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 8 } })
      ev('message_stop', {})
      res.end()
    }
  }
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ bodies, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })))
}
