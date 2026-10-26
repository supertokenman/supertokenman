import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cliInfoFile, startCli } from './cliserver'

const ask = (sock: string, msg: object) =>
  new Promise<{ ok: boolean; data?: unknown; error?: string }>((ok) => {
    const s = connect(sock)
    let b = ''
    s.on('connect', () => s.write(`${JSON.stringify(msg)}\n`))
    s.on('data', (d) => {
      b += d
      if (b.includes('\n')) (s.end(), ok(JSON.parse(b)))
    })
  })

describe.skipIf(process.platform === 'win32')('command line server', () => {
  it('answers with the token, refuses without it, and keeps its files private', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cli-'))
    const sock = join(home, 'cli.sock')
    const c = startCli(sock, { echo: (a) => ({ got: a.x }), boom: () => { throw new Error('nope') } }, home)
    await new Promise((r) => setTimeout(r, 50))
    const info = JSON.parse(readFileSync(cliInfoFile(home), 'utf8'))
    expect(info.socket).toBe(sock)
    expect(statSync(cliInfoFile(home)).mode & 0o777).toBe(0o600)
    expect(statSync(sock).mode & 0o777).toBe(0o600)
    expect(await ask(sock, { token: info.token, cmd: 'echo', args: { x: 1 } })).toEqual({ ok: true, data: { got: 1 } })
    expect((await ask(sock, { token: 'x'.repeat(48), cmd: 'echo' })).error).toMatch(/Wrong token/)
    expect((await ask(sock, { token: info.token, cmd: 'nope' })).error).toMatch(/Unknown command/)
    expect(await ask(sock, { token: info.token, cmd: 'boom' })).toEqual({ ok: false, error: 'nope' })
    c.stop()
    expect(() => readFileSync(cliInfoFile(home))).toThrow()
  })
})
