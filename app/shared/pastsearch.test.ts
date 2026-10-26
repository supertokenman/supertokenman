import { describe, expect, it } from 'vitest'
import { ftsQuery, marksOf, sessionOf } from './pastsearch'

const log = [
  { type: 'queue-operation', sessionId: 'S1' },
  { type: 'user', uuid: 'u1', sessionId: 'S1', cwd: '/p', gitBranch: 'main', timestamp: '2026-10-01T10:00:00Z', message: { content: 'Fix the login redirect bug <system-reminder>noise</system-reminder>' } },
  { type: 'assistant', uuid: 'a1', message: { content: [{ type: 'text', text: 'Looking at auth.ts' }, { type: 'tool_use', name: 'Read' }] } },
  { type: 'user', uuid: 'r1', message: { content: [{ type: 'tool_result', content: 'file' }] } },
  { type: 'assistant', uuid: 'a2', message: { content: [{ type: 'text', text: 'Fixed: the redirect used the old path.' }, { type: 'tool_use', name: 'Edit' }] } },
  { type: 'assistant', uuid: 'x1', isSidechain: true, message: { content: [{ type: 'text', text: 'subagent' }] } },
  { type: 'user', uuid: 'u2', timestamp: '2026-10-01T10:05:00Z', message: { content: [{ type: 'text', text: 'Now add a test' }] } },
  { type: 'user', uuid: 'm1', isMeta: true, message: { content: 'meta' } },
  { type: 'assistant', uuid: 'a3', message: { content: [{ type: 'text', text: 'Added auth.test.ts' }] } },
].map((x) => JSON.stringify(x)).join('\n') + '\nnot json\n'

describe('pastsearch', () => {
  it('reads turns with their first and last entry', () => {
    const s = sessionOf(log)
    expect(s).toMatchObject({ sessionId: 'S1', cwd: '/p', branch: 'main' })
    expect(s.turns.map((t) => [t.n, t.uuid, t.endUuid, t.prompt, t.tools.join()])).toEqual([
      [1, 'u1', 'a2', 'Fix the login redirect bug', 'Read,Edit'],
      [2, 'u2', 'a3', 'Now add a test', ''],
    ])
    expect(s.turns[0]!.reply).toBe('Looking at auth.ts\nFixed: the redirect used the old path.')
  })
  it('makes safe queries', () => {
    expect(ftsQuery('login redir')).toBe('"login"* "redir"*')
    expect(ftsQuery('"old path" -test')).toBe('"old path" NOT "test"*')
    expect(ftsQuery('-only')).toBe('')
    expect(ftsQuery('auth.ts OR NEAR(x')).toBe('"auth ts" "OR"* "NEAR x"')
    expect(ftsQuery('  ')).toBe('')
  })
  it('turns markers into ranges', () => {
    expect(marksOf('fix the \u0001login\u0002 bug')).toEqual({ text: 'fix the login bug', marks: [[8, 13]] })
  })
})
