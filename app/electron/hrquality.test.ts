import { describe, expect, it } from 'vitest'
import { quality, type Inspected } from './hrquality'

const req = (before: string, after: string): Inspected => ({
  request_id: 'hr_1',
  timestamp: 't',
  tokens_saved: 900,
  savings_percent: 90.4,
  transforms_applied: ['router:tool_result:log'],
  request_messages: [{ role: 'user', content: 'hi' }, { role: 'user', content: [{ type: 'tool_result', content: before }] }],
  compressed_messages: [{ role: 'user', content: 'hi' }, { role: 'user', content: [{ type: 'tool_result', content: after }] }],
})

describe('headroom quality', () => {
  it('measures what a changed message kept, its error lines and whether the rest can be fetched', () => {
    const before = 'line one ok\nERROR: db refused connection\nline three ok\nline four ok'
    const q = quality(req(before, 'ERROR: db refused connection\n[3 lines omitted. Retrieve more: hash=ab12]'))
    expect(q).toMatchObject({ changed: 1, errors: 1, errorsKept: 1, retrievable: true, percent: 90, saved: 900 })
    expect(q.kept).toBeGreaterThan(20)
    expect(q.kept).toBeLessThan(60)
  })
  it('takes requests without messages', () => {
    expect(quality({ request_id: 'x', timestamp: 't', tokens_saved: 0, savings_percent: 0, transforms_applied: [] } as unknown as Inspected)).toMatchObject({ changed: 0, kept: 100 })
  })
  it('counts nothing when the compressor changed nothing', () => {
    expect(quality(req('same', 'same'))).toMatchObject({ changed: 0, kept: 100, errors: 0 })
  })
})
