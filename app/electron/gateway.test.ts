import { createServer, request, type IncomingHttpHeaders } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Gateway, internal, type LogLine } from './gateway'

let upstream: ReturnType<typeof createServer>
let upPort = 0
const seen: IncomingHttpHeaders[] = []
beforeAll(async () => {
  upstream = createServer((req, res) => {
    seen.push(req.headers)
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('event: a\ndata: {"n":1}\n\n')
      setTimeout(() => res.end(`event: b\ndata: ${JSON.stringify({ echo: body })}\n\n`), 20)
    })
  })
  await new Promise<void>((d) => upstream.listen(0, '127.0.0.1', d))
  upPort = (upstream.address() as { port: number }).port
})
afterAll(() => upstream.close())

const call = (port: number, token: string, path = '/v1/messages', body = '{"hi":1}') =>
  new Promise<{ status: number; text: string }>((done) => {
    const r = request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'x-api-key': token, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let t = ''
      res.on('data', (c) => (t += c))
      res.on('end', () => done({ status: res.statusCode ?? 0, text: t }))
    })
    r.end(body)
  })

describe('credential gateway', () => {
  it('swaps the panel token for the key and streams the answer through', async () => {
    const logs: LogLine[] = []
    const g = new Gateway({ upstream: () => `http://127.0.0.1:${upPort}`, key: () => 'sk-real-key', allowLocal: (h) => h === `127.0.0.1:${upPort}`, onLog: (l) => logs.push(l) })
    await g.start()
    const env = g.envFor('s1')
    expect(env.ANTHROPIC_API_KEY).toMatch(/^stm-gw-/)
    expect(env.ANTHROPIC_API_KEY).not.toContain('sk-real')
    const r = await call(g.port, env.ANTHROPIC_API_KEY!)
    expect(r.status).toBe(200)
    expect(r.text).toContain('data: {"n":1}')
    expect(r.text).toContain('{\\"hi\\":1}')
    expect(seen.at(-1)!['x-api-key']).toBe('sk-real-key')
    expect(JSON.stringify(logs)).not.toContain('sk-real-key')
    expect(logs.at(-1)).toMatchObject({ panel: 's1', status: 200, path: '/v1/messages' })
    g.stop()
  })
  it('refuses an unknown token, other paths, and an internal upstream', async () => {
    const g = new Gateway({ upstream: () => 'http://169.254.169.254', key: () => 'k' })
    await g.start()
    expect((await call(g.port, 'nope')).status).toBe(401)
    const t = g.tokenFor('s2')
    expect((await call(g.port, t, '/admin')).status).toBe(404)
    const r = await call(g.port, t)
    expect(r.status).toBe(403)
    expect(r.text).toMatch(/internal address/)
    g.revoke('s2')
    expect((await call(g.port, t)).status).toBe(401)
    g.stop()
  })
  it('takes the panel token as a bearer token too', async () => {
    const g = new Gateway({ upstream: () => `http://127.0.0.1:${upPort}`, key: () => 'sk-real', allowLocal: () => true })
    await g.start()
    const t = g.tokenFor('s9')
    const r = await new Promise<number>((done) => request({ host: '127.0.0.1', port: g.port, path: '/v1/messages', method: 'POST', headers: { authorization: `Bearer ${t}`, 'x-api-key': 'something-else' } }, (res) => (res.resume(), done(res.statusCode ?? 0))).end('{}'))
    expect(r).toBe(200)
    expect(seen.at(-1)!.authorization).toBeUndefined()
    g.stop()
  })
  it('limits requests per panel per minute', async () => {
    const g = new Gateway({ upstream: () => `http://127.0.0.1:${upPort}`, key: () => 'k', allowLocal: () => true, perMinute: 2 })
    await g.start()
    const t = g.tokenFor('s3')
    expect((await call(g.port, t)).status).toBe(200)
    expect((await call(g.port, t)).status).toBe(200)
    expect((await call(g.port, t)).status).toBe(429)
    expect((await call(g.port, g.tokenFor('s4'))).status).toBe(200)
    g.stop()
  })
  it('knows internal addresses', () => {
    for (const h of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'localhost', 'fd00::1']) expect(internal(h), h).toBe(true)
    for (const h of ['api.anthropic.com', '8.8.8.8', '172.32.0.1']) expect(internal(h), h).toBe(false)
  })
})
