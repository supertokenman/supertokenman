import { describe, expect, it } from 'vitest'
import { descendants, group, parsePs } from './health'

describe('health', () => {
  it('reads ps and walks descendants', () => {
    const rows = parsePs('  10   1 1000  0.5 electron .\n  20  10 2048  1.0 node claude --cwd /x\n  30  20  512  0.0 git status\n  40   1  100  0.0 other\n')
    expect(descendants(rows, 10).map((r) => r.pid)).toEqual([20, 30])
  })
  it('groups processes by what they show and ranks by memory', () => {
    const parts = group(
      [
        { pid: 1, type: 'Browser', cpu: 1, memKb: 200 * 1024 },
        { pid: 2, type: 'GPU', cpu: 3, memKb: 100 * 1024 },
        { pid: 3, type: 'Tab', cpu: 2, memKb: 150 * 1024 },
        { pid: 4, type: 'Tab', cpu: 9, memKb: 320 * 1024 },
      ],
      [{ pid: 3, kind: 'window', label: 'Window' }, { pid: 4, kind: 'webapp', label: 'YouTube', app: 'youtube' }],
      [{ sid: 's1', label: 'Claude: engine', pids: [50], rssKb: 180 * 1024, cpu: 0.4 }],
    )
    expect(parts.map((p) => [p.label, p.memMb])).toEqual([['YouTube', 320], ['SuperTokenMan (main, GPU, network)', 300], ['Claude: engine', 180], ['Window', 150]])
    expect(parts[0]!.app).toBe('youtube')
  })
})
