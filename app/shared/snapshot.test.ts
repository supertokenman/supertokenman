import { describe, expect, it } from 'vitest'
import { fromTool, record, snapshot, type Ev } from './snapshot'

describe('session snapshot', () => {
  it('keeps edits, git and failures from tool calls, never secret files', () => {
    expect(fromTool('Edit', { file_path: '/p/src/a.ts' }, '', 1)).toEqual([{ kind: 'edit', at: 1, file: '/p/src/a.ts' }])
    expect(fromTool('Write', { file_path: '/p/.env' }, '', 1)).toEqual([])
    expect(fromTool('Write', { file_path: '/p/.env.local' }, '', 1)).toEqual([])
    expect(fromTool('Edit', { file_path: '/home/u/.ssh/id_ed25519' }, '', 1)).toEqual([])
    expect(fromTool('Bash', { command: 'git commit -m "x"' }, 'ok', 2).map((e) => e.kind)).toEqual(['git', 'fixed'])
    expect(fromTool('Bash', { command: 'npm test' }, 'FAIL src/a.test.ts', 3)[0]!.kind).toBe('error')
  })
  it('an error fixed later is not reported as open', () => {
    let evs: Ev[] = [{ kind: 'task', at: 0, text: 'Add Pix to checkout' }]
    evs = record(evs, fromTool('Bash', { command: 'npm test' }, 'FAIL x', 1))
    expect(snapshot(evs)).toContain('Still failing')
    evs = record(evs, fromTool('Bash', { command: 'npm test' }, 'all passed', 2))
    expect(snapshot(evs)).not.toContain('Still failing')
    expect(snapshot(evs)).toContain('Add Pix to checkout')
  })
  it('stays under its budget, the task first', () => {
    const evs: Ev[] = [{ kind: 'task', at: 0, text: 'Refactor billing' }, ...Array.from({ length: 50 }, (_, i) => ({ kind: 'edit' as const, at: i + 1, file: `/p/src/module-${i}/a-rather-long-file-name.ts` }))]
    const s = snapshot(evs, 120)
    expect(Math.ceil(s.length / 4)).toBeLessThanOrEqual(120)
    expect(s).toContain('Refactor billing')
    expect(s).toContain('Files changed')
  })
  it('nothing to say gives nothing', () => expect(snapshot([])).toBe(''))
})
