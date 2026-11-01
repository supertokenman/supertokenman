import { describe, expect, it } from 'vitest'
import { uiTools, type UiDeps } from './uitools'

function deps(allow: boolean) {
  const calls: string[] = []
  let n = 3
  const panels = [{ id: 's2', folder: '/w', name: 'w', persona: null }]
  const d: UiDeps = {
    me: 's2',
    panels: () => panels,
    links: () => [],
    link: (a, b, auto) => void calls.push(`link ${a}-${b} ${auto}`),
    cmd: async (op, arg) => (calls.push(`${op} ${arg}`), { layout: 'canvas' }),
    folder: (f) => (f === '.' ? '/w' : f),
    known: () => undefined,
    spawnLeft: () => 10,
    confirm: async (items) => (calls.push(`confirm ${items.map((i) => i.title).join(',')}`), allow),
    open: async (p) => {
      const id = `s${n++}`
      panels.push({ id, folder: p.folder, name: p.title ?? id, persona: null })
      calls.push(`open ${id}`)
      return id
    },
    log: () => undefined,
    lead: {
      leads: () => new Set(),
      workers: () => [],
      send: async () => undefined,
      adopt: () => undefined,
      wait: async () => [],
      owns: () => false,
      openTree: async () => 'x',
      team: (lead, ws) => void calls.push(`team ${lead} ${ws.map((w) => `${w.id}:${w.title}`).join(',')}`),
    },
  }
  const run = (args: unknown) => (uiTools(d).find((t) => t.name === 'ui_open_panels')!.handler as (a: unknown, x: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>)(args, {})
  return { calls, run }
}

describe('ui_open_panels with a lead', () => {
  it('opens the workers, links each to this panel, marks the team and fans the canvas, in one confirmed call', async () => {
    const { calls, run } = deps(true)
    const r = await run({ panels: [{ folder: '.', title: 'Worker 1' }, { folder: '.', title: 'Worker 2' }], lead: 'self', layout: 'canvas' })
    expect(r.isError).toBeFalsy()
    expect(calls).toEqual(['confirm Worker 1,Worker 2', 'open s3', 'open s4', 'link s2-s3 false', 'link s2-s4 false', 'team s2 s3:Worker 1,s4:Worker 2', 'layout canvas', 'arrange fan'])
    expect(r.content[0]!.text).toContain('"Worker 1"')
  })
  it('opens and links nothing before Allow', async () => {
    const { calls, run } = deps(false)
    const r = await run({ panels: [{ folder: '.' }], lead: 'self' })
    expect(r.isError).toBe(true)
    expect(calls).toEqual(['confirm '])
  })
  it('refuses a lead that is not open', async () => {
    const { calls, run } = deps(true)
    expect((await run({ panels: [{ folder: '.' }], lead: 's9' })).isError).toBe(true)
    expect(calls).toEqual([])
  })
})
