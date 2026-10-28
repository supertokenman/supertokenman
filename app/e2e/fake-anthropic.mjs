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
    })
  })
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ bodies, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })))
}
