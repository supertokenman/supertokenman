import { describe, expect, it } from 'vitest'
import { edgeStatus, finishedLine, MAX_WORKERS, planDelegation, summarizeResult, taskTitle, truncate, type WorkerInfo } from './lead.js'

const lead = new Set(['L'])
const p = (id: string, folder: string, busy = false, l: string | null = null): WorkerInfo => ({ id, folder, busy, lead: l })
const base = { lead: 'L', leadFolder: '/r', leads: lead }

describe('planDelegation', () => {
  it('opens in the lead folder by default', () => {
    expect(planDelegation({ ...base, panels: [p('L', '/r')] })).toEqual({ kind: 'open', folder: '/r' })
  })
  it('reuses an idle worker of the lead in that folder', () => {
    expect(planDelegation({ ...base, panels: [p('L', '/r'), p('w1', '/r', true, 'L'), p('w2', '/r', false, 'L')] })).toEqual({ kind: 'reuse', id: 'w2' })
  })
  it('does not reuse a busy worker, another lead worker or a worktree task', () => {
    expect(planDelegation({ ...base, panels: [p('L', '/r'), p('w1', '/r', true, 'L')] }).kind).toBe('open')
    expect(planDelegation({ ...base, panels: [p('L', '/r'), p('w1', '/r', false, 'X')] }).kind).toBe('open')
    expect(planDelegation({ ...base, worktree: true, panels: [p('L', '/r'), p('w1', '/r', false, 'L')] }).kind).toBe('open')
  })
  it('refuses a non-lead and a worker', () => {
    expect(planDelegation({ ...base, leads: new Set(), panels: [p('L', '/r')] }).kind).toBe('refuse')
    expect(planDelegation({ ...base, leads: new Set(['L']), panels: [p('L', '/r', false, 'Z')] }).kind).toBe('refuse')
  })
  it('caps the workers', () => {
    const ws = Array.from({ length: MAX_WORKERS }, (_, i) => p(`w${i}`, '/r', true, 'L'))
    expect(planDelegation({ ...base, panels: [p('L', '/r'), ...ws] }).kind).toBe('refuse')
  })
})

describe('edgeStatus', () => {
  it('orders error, waiting, working, done', () => {
    expect(edgeStatus({ busy: true, error: true, hasTask: true })).toBe('error')
    expect(edgeStatus({ busy: true, asking: true, hasTask: true })).toBe('waiting')
    expect(edgeStatus({ busy: true, hasTask: true })).toBe('working')
    expect(edgeStatus({ busy: false, finished: true, hasTask: true })).toBe('done')
    expect(edgeStatus({ busy: false, hasTask: true })).toBe('waiting')
    expect(edgeStatus({ busy: false, hasTask: false })).toBe('idle')
  })
})

describe('results', () => {
  it('truncates at a word with a mark', () => {
    expect(truncate('short', 20)).toBe('short')
    const t = truncate('alpha beta gamma delta epsilon', 18)
    expect(t.length).toBeLessThanOrEqual(18)
    expect(t.endsWith('…')).toBe(true)
  })
  it('summarizes with files and cost', () => {
    const s = summarizeResult({ id: 'w1', name: 'api-worker', text: 'Done.', isError: false, files: ['a.ts', 'b.ts'], costUsd: 0.1234 })
    expect(s).toContain('api-worker (w1) finished.')
    expect(s).toContain('Files changed (2): a.ts, b.ts.')
    expect(s).toContain('Cost: $0.12.')
  })
  it('caps a long answer and a long file list', () => {
    const s = summarizeResult({ id: 'w', name: 'n', text: 'x '.repeat(5000), isError: true, files: Array.from({ length: 20 }, (_, i) => `f${i}`), costUsd: 0 }, 100)
    expect(s).toContain('ended with an error')
    expect(s).toContain('and 8 more')
    expect(s.length).toBeLessThan(400)
  })
  it('makes the chat line and the title', () => {
    expect(finishedLine({ id: 'w', name: 'api-worker', text: '\nAdded the route.\nmore', isError: false, files: [], costUsd: 0 })).toBe('api-worker finished: Added the route.')
    expect(taskTitle('Fix the login bug\ndetails')).toBe('Fix the login bug')
  })
})

describe('planDelegation to a named open panel', () => {
  const base = { lead: 'L', leadFolder: '/r', leads: new Set(['L']) }
  const ps = [{ id: 'L', folder: '/r', busy: false, lead: null }, { id: 'w', folder: '/x', busy: false, lead: null }, { id: 'o', folder: '/x', busy: false, lead: 'K' }, { id: 'b', folder: '/x', busy: true, lead: null }]
  it('adopts a free open panel', () => expect(planDelegation({ ...base, panels: ps, panel: 'w' })).toEqual({ kind: 'reuse', id: 'w' }))
  it('refuses missing, self, busy and another lead\'s worker', () => {
    for (const p of ['zz', 'L', 'b', 'o']) expect(planDelegation({ ...base, panels: ps, panel: p }).kind).toBe('refuse')
  })
})
