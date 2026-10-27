import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claudeBinary, mergePath, shellPath, shellPathAsync } from './packaged'

describe('packaged', () => {
  it('builds a PATH with the shell and the usual places, without repeats', () => {
    const p = shellPath('/usr/bin:/bin', '/bin/sh').split(':')
    expect(p).toContain('/opt/homebrew/bin')
    expect(p.filter((x) => x === '/usr/bin')).toHaveLength(1)
  })
  it('reads the same PATH without holding the process, and never fails', async () => {
    expect(await shellPathAsync('/usr/bin:/bin', '/bin/sh')).toBe(shellPath('/usr/bin:/bin', '/bin/sh'))
    expect(await shellPathAsync('/x', '/no/such/shell')).toBe(mergePath('', '/x'))
    expect(mergePath('/a:/usr/bin', '/usr/bin:/b').split(':').slice(0, 3)).toEqual(['/a', '/usr/bin', '/b'])
  })
  it('finds the unpacked Claude binary', () => {
    const res = join(tmpdir(), `stm-res-${Date.now()}`)
    const dir = join(res, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-agent-sdk-darwin-arm64')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'claude'), '')
    expect(claudeBinary(res, 'darwin', 'arm64')).toBe(join(dir, 'claude'))
    expect(claudeBinary(res, 'darwin', 'x64')).toBeUndefined()
  })
})
