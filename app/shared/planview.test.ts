import { describe, expect, it } from 'vitest'
import { planFrom } from './planview'

const base = { panel: 'p1', sessionId: 's1', turn: 2, at: 1000 }
const todos = (...t: { content: string; status: string; activeForm?: string }[]) => ({ todos: t })

describe('planFrom', () => {
  it('takes the items of the latest TodoWrite, and a later one replaces the plan', () => {
    const plan = planFrom({
      ...base,
      calls: [
        { name: 'TodoWrite', input: todos({ content: 'Read spec', status: 'completed' }, { content: 'Write code', status: 'pending' }) },
        { name: 'Read', input: { file_path: 'x' } },
        { name: 'TodoWrite', input: todos({ content: 'Write code', status: 'in_progress', activeForm: 'Writing code' }) },
      ],
    })
    expect(plan.items).toEqual([{ text: 'Write code', status: 'in_progress', active: 'Writing code' }])
    expect(plan).toMatchObject({ panel: 'p1', sessionId: 's1', turn: 2, at: 1000 })
  })

  it('counts Task and Agent calls as agents, and spawn calls by the panels they start', () => {
    const plan = planFrom({
      ...base,
      calls: [
        { name: 'Task', input: {} },
        { name: 'Agent', input: {} },
        { name: 'mcp__stm__ui_open_panels', input: { panels: [{ folder: 'a' }, { folder: 'b' }, { folder: 'c' }] } },
        { name: 'mcp__stm__delegate', input: { task: 'x' } },
        { name: 'mcp__stm__collect', input: {} },
      ],
    })
    expect(plan.agents).toEqual({ used: 2, cap: 8 })
    expect(plan.fanout).toEqual({ used: 4, cap: 5 })
  })

  it('uses the caps given, else 8 agents and 5 fan-out', () => {
    const plan = planFrom({ ...base, calls: [], agentCap: 3, fanoutCap: 1 })
    expect(plan.agents.cap).toBe(3)
    expect(plan.fanout.cap).toBe(1)
    expect(planFrom({ ...base, calls: [] })).toMatchObject({ items: [], agents: { used: 0, cap: 8 }, fanout: { used: 0, cap: 5 } })
  })

  it('ignores malformed TodoWrite input and keeps the last valid plan', () => {
    const plan = planFrom({
      ...base,
      calls: [
        { name: 'TodoWrite', input: todos({ content: 'Keep me', status: 'pending' }) },
        { name: 'TodoWrite', input: { todos: 'nope' } },
        { name: 'TodoWrite', input: null },
        { name: 'TodoWrite', input: 42 },
      ],
    })
    expect(plan.items.map((i) => i.text)).toEqual(['Keep me'])
  })

  it('skips malformed items and keeps the good ones', () => {
    const plan = planFrom({
      ...base,
      calls: [
        {
          name: 'TodoWrite',
          input: { todos: [null, 'x', { content: 'bad status', status: 'done' }, { status: 'pending' }, { content: '   ', status: 'pending' }, { content: 'good', status: 'completed' }] },
        },
      ],
    })
    expect(plan.items).toEqual([{ text: 'good', status: 'completed' }])
  })

  it('ignores malformed call entries and spawn input without a list', () => {
    const plan = planFrom({
      ...base,
      calls: [null as unknown as { name: string; input: unknown }, { name: 42 as unknown as string, input: {} }, { name: 'mcp__stm__ui_open_panels', input: { panels: 'x' } }],
    })
    expect(plan.fanout.used).toBe(0)
    expect(plan.items).toEqual([])
  })
})
