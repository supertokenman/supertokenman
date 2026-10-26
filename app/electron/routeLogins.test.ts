import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OPEN_SHIM, routeLogins } from './integrations'

describe('routeLogins', () => {
  it('puts the shim first on PATH of the mcp-remote servers only', () => {
    const s = routeLogins(
      {
        linear: { type: 'stdio', command: 'npx', args: ['-y', 'mcp-remote@0.15.2', 'https://mcp.linear.app/mcp'] },
        supa: { type: 'stdio', command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@0.14.0'], env: { A: '1' } },
      },
      '/shim',
      '/auth',
      '/usr/bin',
    )
    expect(s.linear).toMatchObject({ env: { PATH: '/shim:/usr/bin', STM_AUTH_DIR: '/auth' } })
    expect(s.supa).toMatchObject({ env: { A: '1' } })
  })
  it('the shim drops a web link for the app and does not open a browser', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shim-'))
    const shim = join(dir, 'open')
    writeFileSync(shim, OPEN_SHIM, { mode: 0o755 })
    execFileSync(shim, ['https://mcp.linear.app/authorize?x=1&y=2'], { env: { ...process.env, STM_AUTH_DIR: dir } })
    const f = readdirSync(dir).find((n) => n.endsWith('.url'))!
    expect(readFileSync(join(dir, f), 'utf8')).toBe('https://mcp.linear.app/authorize?x=1&y=2\n')
  })
})
