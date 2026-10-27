import { describe, expect, it } from 'vitest'
import { claudeByFolder, descendants, group, parsePs } from './health'

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
  it('counts each Claude process once when panels share a folder', () => {
    const kids = parsePs('  20  10 1048576  40.0 claude\n  21  20 524288  10.0 node mcp\n  22  10 262144  5.0 claude\n')
    const cwds = new Map([[20, '/w/dev/acme'], [21, '/w/dev/acme'], [22, '/w/other']])
    const sessions = [{ sid: 'a', cwd: '/w/dev/acme' }, { sid: 'b', cwd: '/w/dev/acme' }, { sid: 'c', cwd: '/w/dev/acme' }, { sid: 'd', cwd: '/w/other' }]
    const rows = claudeByFolder(sessions, kids, cwds)
    expect(rows.map((r) => [r.label, r.rssKb / 1024 / 1024, r.cpu])).toEqual([['Claude: dev/acme (3 panels)', 1.5, 50], ['Claude: w/other', 0.25, 5]])
    const total = group([], [], rows).reduce((n, p) => n + p.memMb, 0)
    expect(total).toBe(1792)
  })
})
