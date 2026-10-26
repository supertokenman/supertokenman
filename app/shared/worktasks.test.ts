import { describe, expect, it } from 'vitest'
import { addTurn, byPanel, decide, link, newTask, taskVerdict } from './worktasks'

describe('work tasks', () => {
  it('adds spend, says each alert once, and holds at the limit', () => {
    let t = link(link(newTask('t1', 'Pix checkout', 'ship pix', 1, 0), 's1', 'acme', 1), 's2', 'acme review', 2)
    let r = addTurn(t, 's1', 0.55, 'acme', 3)
    expect(r.alerts).toEqual([50])
    t = r.task
    r = addTurn(t, 's2', 0.3, 'acme review', 4)
    expect(r.alerts).toEqual([80])
    t = r.task
    expect(taskVerdict(t, 0.1)).toEqual({ ok: true })
    expect(taskVerdict(t, 0.2).ok).toBe(false)
    r = addTurn(t, 's1', 0.2, 'acme', 5)
    expect(r.alerts).toEqual([100])
    expect(addTurn(r.task, 's1', 0.1, 'acme', 6).alerts).toEqual([])
    expect(byPanel(r.task)).toEqual({ s1: 0.75, s2: 0.3 })
  })
  it('has no limit without a budget, or once decided', () => {
    expect(taskVerdict(newTask('t', 'x', '', 0, 0), 99)).toEqual({ ok: true })
    const t = addTurn(newTask('t', 'x', '', 1, 0), 's', 5, 'a', 1).task
    expect(taskVerdict(t, 0).ok).toBe(false)
    expect(taskVerdict(decide(t, 'Merged PR 12', 2), 0)).toEqual({ ok: true })
  })
  it('links once', () => {
    const t = link(link(newTask('t', 'x', '', 0, 0), 's', 'a', 1), 's', 'a', 2)
    expect(t.sids).toEqual(['s'])
    expect(t.events.filter((e) => e.kind === 'link')).toHaveLength(1)
  })
})
