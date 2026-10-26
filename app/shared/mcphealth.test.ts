import { describe, expect, it } from 'vitest'
import { approve, diff, held, printOf, record, type Check } from './mcphealth'

const check = (tools: Record<string, string>, ok = true, at = 1): Check => ({ at, ok, ms: 10, tokens: 100, tools })

describe('mcp health', () => {
  it('fingerprints tools by description and schema', () => {
    expect(printOf({ description: 'a' })).toBe(printOf({ description: 'a' }))
    expect(printOf({ description: 'a' })).not.toBe(printOf({ description: 'a', inputSchema: { x: 1 } }))
  })

  it('approves the first check and holds what changes after', () => {
    let h = record({ servers: {} }, 'db', check({ list: 'aa', run: 'bb' }))
    expect(held(h, 'db')).toEqual([])
    h = record(h, 'db', check({ list: 'aa', run: 'cc', drop: 'dd' }, true, 2))
    expect(diff(h.servers.db!.approved, h.servers.db!.last!.tools)).toEqual({ added: ['drop'], changed: ['run'], removed: [] })
    expect(held(h, 'db')).toEqual(['drop', 'run'])
    h = approve(h, 'db', 3)
    expect(held(h, 'db')).toEqual([])
    expect(h.servers.db!.approvedAt).toBe(3)
  })

  it('does not approve a failed first check', () => {
    const h = record({ servers: {} }, 'x', check({}, false))
    expect(h.servers.x!.approved).toBeUndefined()
  })
})
