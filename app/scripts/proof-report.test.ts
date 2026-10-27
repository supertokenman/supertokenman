import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script, no types
import * as R from './proof-report.mjs'
// @ts-expect-error plain ESM script, no types
import * as M from './proof-mock-api.mjs'

const doc = readFileSync(new URL('../../docs/NETWORK.md', import.meta.url), 'utf8')

describe('Mac proof report', () => {
  it('reads the allowed hosts from docs/NETWORK.md', () => {
    const allowed = R.allowedHosts(doc)
    expect(allowed).toContain('github.com')
    expect(allowed).toContain('release-assets.githubusercontent.com')
    expect(allowed).toContain('api.frankfurter.dev')
    expect(allowed).not.toContain('play.googleapis.com')
    expect(allowed.some((h: string) => h.endsWith('.mjs') || h.endsWith('.yml'))).toBe(false)
  })

  it('allows a host or a name under it, with or without a port', () => {
    const allowed = ['github.com']
    expect(R.hostAllowed('github.com:443', allowed)).toBe(true)
    expect(R.hostAllowed('lb-140-82-112-4-iad.github.com.', allowed)).toBe(true)
    expect(R.hostAllowed('evilgithub.com', allowed)).toBe(false)
  })

  it('lists the hosts of the net log and of the proxy log, loopback left out', () => {
    const net = '{"params":{"url":"https://github.com/a/b"}},{"url":"https://github.com/c"},{"url":"wss://x.example.com:8443/s"},{"url":"http://127.0.0.1:9333/json"}'
    expect(R.netlogHosts(net)).toEqual([{ host: 'github.com', n: 2 }, { host: 'x.example.com', n: 1 }])
    const mitm = '[11:35:01.2] server connect api.anthropic.com:443 (160.79.104.10:443)\n[11:35:02] server connect api.anthropic.com:443\nserver connect play.googleapis.com:443'
    expect(R.mitmNames(mitm)).toEqual([{ host: 'api.anthropic.com', n: 2 }, { host: 'play.googleapis.com', n: 1 }])
  })

  it('tells the app processes apart from the ones it starts', () => {
    const log = [
      '11:00:00 SuperToke 101 IPv4 10.0.0.2:5000->140.82.112.4:443 (ESTABLISHED)',
      '11:00:00 claude 202 IPv4 10.0.0.2:5001->160.79.104.10:443 (ESTABLISHED)',
      '11:00:01 SuperToke 101 IPv4 127.0.0.1:5002->127.0.0.1:8899 (ESTABLISHED)',
      '11:00:01 node 303 IPv4 10.0.0.2:5003->*:*',
    ].join('\n')
    const eps = R.endpoints(log)
    expect(eps.map((e: { remote: string; app: boolean }) => [e.remote, e.app])).toEqual([['140.82.112.4:443', true], ['160.79.104.10:443', false]])
  })

  it('fails on the decoy, on a host outside the doc, and on an unnamed direct connection of the app', () => {
    const allowed = ['github.com']
    expect(R.verdict({ decoyHits: [], netlog: [{ host: 'github.com', n: 1 }], appDirect: [{ remote: '140.82.112.4:443', name: 'lb.github.com' }], allowed })).toEqual([])
    const fail = R.verdict({ decoyHits: ['profile/x.log'], netlog: [{ host: 'play.googleapis.com', n: 2 }], appDirect: [{ remote: '1.2.3.4:443', name: '' }], allowed })
    expect(fail).toHaveLength(3)
    expect(fail[0]).toMatch(/decoy was found in profile\/x.log/)
    expect(fail[1]).toMatch(/play.googleapis.com/)
    expect(fail[2]).toMatch(/1.2.3.4:443 \(no name\)/)
  })

  it('finds the decoy in any file of the run but the decoy file itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stm-proof-'))
    mkdirSync(join(dir, 'profile'))
    writeFileSync(join(dir, 'decoy.txt'), 'stm_decoy_abc\n')
    writeFileSync(join(dir, 'profile', 'clean.log'), 'nothing')
    writeFileSync(join(dir, 'profile', 'leak.log'), 'x stm_decoy_abc y')
    expect(R.filesWith(dir, 'stm_decoy_abc', [join(dir, 'decoy.txt')])).toEqual([join(dir, 'profile', 'leak.log')])
  })

  it('says in the report when the Claude turn was skipped', () => {
    const md = R.render({ version: '0.1.6', system: 'macOS 15', date: 'now', run: 'local', checks: 'ok', endpoints: [], names: [], netlog: [], refused: [], decoyHits: [], fail: [],
      drive: { vault: 'DECOY_KEY added', panel: 'open', claude: 'skipped: no ANTHROPIC_API_KEY in the proof environment', command: 'not asked' } })
    expect(md).toMatch(/Result: passed/)
    expect(md).toMatch(/Claude turn: skipped: no ANTHROPIC_API_KEY/)
    for (const s of ['## The download', '## Where the app and its processes connected', '## Host names through the proxy', '## The decoy secret', '## What this does not show']) expect(md).toContain(s)
  })

  it('sums what Claude Code sent to the mock and shows it in the report', () => {
    const jsonl = [
      JSON.stringify({ method: 'POST', path: '/v1/messages?beta=true', bytes: 100, body: 'x' }),
      JSON.stringify({ method: 'POST', path: '/v1/messages', bytes: 50, body: 'y' }),
      'not json',
      JSON.stringify({ method: 'POST', path: '/v1/messages/count_tokens', body: 'abc' }),
    ].join('\n')
    const m = R.mockSummary(jsonl)
    expect(m).toEqual({ requests: 3, bytes: 153, paths: [{ host: 'POST /v1/messages', n: 2 }, { host: 'POST /v1/messages/count_tokens', n: 1 }] })
    const md = R.render({ version: '0.1.6', system: 'macOS', date: 'now', run: 'local', checks: '', endpoints: [], names: [], netlog: [], refused: [], decoyHits: ['mock-requests.jsonl'], fail: ['the decoy was found in mock-requests.jsonl'], mock: m,
      drive: { mode: 'mock Anthropic API, local', vault: 'v', panel: 'p', claude: 'answered', command: 'allowed' } })
    expect(md).toContain('## What Claude Code sent')
    expect(md).toMatch(/Requests: 3, 153 bytes/)
    expect(md).toMatch(/The decoy in what Claude Code sent: FOUND/)
    expect(md).toMatch(/not exercise Anthropic's real/)
    expect(md).toMatch(/Result: FAILED/)
  })
})

describe('Mac proof mock API', () => {
  const tools = [{ name: 'Read' }, { name: 'Bash' }]
  it('asks for Bash first, answers in text after the tool result, and in short text for side calls', () => {
    expect(M.replyFor({ tools, messages: [{ role: 'user', content: 'run echo hello' }] })).toEqual({ kind: 'tool', name: 'Bash', input: M.COMMAND })
    expect(M.replyFor({ tools, messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: [] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'hello' }] }] })).toEqual({ kind: 'text', text: M.FINAL_TEXT })
    expect(M.replyFor({ messages: [{ role: 'user', content: 'title this' }] }).kind).toBe('text')
  })

  it('masks keys and records every request; streams a tool_use over SSE', async () => {
    const seen: Array<{ headers: Record<string, string>; body: string }> = []
    const server = M.mockServer((e: { headers: Record<string, string>; body: string }) => seen.push(e))
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    try {
      const body = JSON.stringify({ model: 'm', stream: true, tools, messages: [{ role: 'user', content: 'go' }] })
      const res = await fetch(`${url}/v1/messages?beta=true`, { method: 'POST', headers: { 'x-api-key': 'proof-mock-key', 'content-type': 'application/json' }, body })
      const text = await res.text()
      for (const e of ['message_start', 'content_block_start', 'input_json_delta', 'content_block_stop', 'message_delta', 'message_stop']) expect(text).toContain(e)
      expect(text).toContain('"name":"Bash"')
      expect(text).toContain('"stop_reason":"tool_use"')
      const plain = await (await fetch(`${url}/v1/messages`, { method: 'POST', body: JSON.stringify({ messages: [] }) })).json()
      expect(plain.content[0].type).toBe('text')
      expect(await (await fetch(`${url}/v1/messages/count_tokens`, { method: 'POST', body: '{}' })).json()).toEqual({ input_tokens: 10 })
      expect(seen).toHaveLength(3)
      expect(seen[0].headers['x-api-key']).toBe('[masked]')
      expect(seen[0].body).toBe(body)
    } finally {
      server.close()
    }
  })
})
