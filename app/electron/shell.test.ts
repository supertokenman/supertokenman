import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShellRunner, type ShellEvent } from './shell'

const until = (events: ShellEvent[], id: string) =>
  new Promise<void>((resolve) => {
    const t = setInterval(() => {
      if (events.some((e) => e.kind === 'shell-end' && e.id === id)) {
        clearInterval(t)
        resolve()
      }
    }, 10)
  })

describe('ShellRunner', () => {
  it('runs in the panel folder and streams output and the exit code', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stm-sh-'))
    const events: ShellEvent[] = []
    const sh = new ShellRunner((e) => events.push(e), { shell: '/bin/bash', env: () => ({ STM_TEST: 'vault value' }) })
    const id = sh.run('pwd; echo "$STM_TEST"; echo oops >&2; exit 3', dir)
    await until(events, id)
    const out = events.filter((e) => e.kind === 'shell-out' && e.stream === 'out').map((e) => (e as { text: string }).text).join('')
    expect(out).toContain(dir)
    expect(out).toContain('vault value')
    expect(events.some((e) => e.kind === 'shell-out' && e.stream === 'err' && e.text.includes('oops'))).toBe(true)
    expect(events.at(-1)).toMatchObject({ kind: 'shell-end', id, code: 3 })
  })

  it('stops a running command', async () => {
    const events: ShellEvent[] = []
    const sh = new ShellRunner((e) => events.push(e), { shell: '/bin/bash' })
    const id = sh.run('sleep 30', tmpdir())
    setTimeout(() => sh.stop(id), 100)
    await until(events, id)
    expect(events.at(-1)).toMatchObject({ kind: 'shell-end', id })
  })
})
