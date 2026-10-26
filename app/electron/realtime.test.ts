import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Live, prepare, type Entry } from './realtime'

const vault = { get: (n: string) => (n === 'TOKEN' ? 'sekret-123456' : undefined), all: () => [{ value: 'sekret-123456' }] }

describe('live connections', () => {
  let srv: http.Server
  let base = ''
  beforeAll(async () => {
    srv = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(`event: hello\ndata: auth=${req.headers.authorization}\n\n`)
      res.write('data: {"n":1}\n\n')
      res.end()
    })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  })
  afterAll(() => srv.close())

  it('fills secrets and checks the scheme for the kind', () => {
    expect(prepare({ kind: 'ws', url: 'wss://x/{{TOKEN}}', headers: [] }, vault)).toEqual({ url: 'wss://x/sekret-123456', headers: {} })
    expect(prepare({ kind: 'ws', url: 'https://x', headers: [] }, vault)).toHaveProperty('error')
    expect(prepare({ kind: 'sse', url: 'ws://x', headers: [] }, vault)).toHaveProperty('error')
    expect(prepare({ kind: 'sio', url: 'http://x', headers: [{ key: 'X', value: '{{NOPE}}', on: true }] }, vault)).toEqual({ error: 'Not in the vault: NOPE.' })
  })

  it('reads SSE events, sends the header, and masks the secret coming back', async () => {
    const got: Entry[] = []
    const done = new Promise<void>((resolve) => {
      const live = new Live(vault, (_id, e) => ('closed' in e ? resolve() : got.push(e)))
      expect(live.connect('a', { kind: 'sse', url: `${base}/events`, headers: [{ key: 'Authorization', value: 'Bearer {{TOKEN}}', on: true }] })).toEqual({ ok: true })
    })
    await done
    const ins = got.filter((e) => e.dir === 'in')
    expect(ins[0]).toMatchObject({ event: 'hello', text: 'auth=Bearer ••••••' })
    expect(ins[1]).toMatchObject({ event: 'message', text: '{"n":1}' })
    expect(got.at(-1)?.text).toBe('The server ended the stream.')
  })
})
