// The app's command line: a local socket only this user can reach, and a token in a file only this
// user can read (~/.supertokenman/cli.json, mode 600). The stm script finds both there. Each request
// is one JSON line in, one JSON line out.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type CliHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown
export const cliInfoFile = (home = homedir()) => join(home, '.supertokenman', 'cli.json')

export function startCli(socketPath: string, handlers: Record<string, CliHandler>, home = homedir()): { server: Server; token: string; stop: () => void } {
  const token = randomBytes(24).toString('hex')
  const want = Buffer.from(token)
  try {
    if (process.platform !== 'win32') rmSync(socketPath, { force: true })
  } catch {
    // an old socket from a crash
  }
  const server = createServer((conn) => {
    let buf = ''
    conn.setEncoding('utf8')
    conn.on('data', (d) => {
      buf += d
      if (buf.length > 1_000_000) return conn.destroy()
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        void answer(line).then((r) => conn.write(`${JSON.stringify(r)}\n`))
      }
    })
    conn.on('error', () => undefined)
  })
  async function answer(line: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    let req: { token?: string; cmd?: string; args?: Record<string, unknown> }
    try {
      req = JSON.parse(line)
    } catch {
      return { ok: false, error: 'Not JSON.' }
    }
    const got = Buffer.from(String(req.token ?? ''))
    if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, error: 'Wrong token: the app was restarted? Run the command again.' }
    const h = handlers[String(req.cmd)]
    if (!h) return { ok: false, error: `Unknown command "${req.cmd}". Try: stm help` }
    try {
      return { ok: true, data: await h(req.args ?? {}) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e) }
    }
  }
  server.listen(socketPath, () => {
    if (process.platform !== 'win32') chmodSync(socketPath, 0o600)
  })
  const info = cliInfoFile(home)
  mkdirSync(join(home, '.supertokenman'), { recursive: true, mode: 0o700 })
  writeFileSync(info, JSON.stringify({ socket: socketPath, token, pid: process.pid }), { mode: 0o600 })
  chmodSync(info, 0o600)
  return {
    server,
    token,
    stop: () => {
      server.close()
      rmSync(info, { force: true })
    },
  }
}
