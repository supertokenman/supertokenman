import { describe, expect, it } from 'vitest'
import { layout, neighbors } from './vaultLayout'
import type { GraphNode } from '../electron/memory'

const node = (id: string, kind: GraphNode['kind'], project = '', usd = 0): GraphNode => ({ id, kind, title: id, project, date: '', usd, files: [] })

describe('vault map layout', () => {
  const nodes = [
    node('projects/engine.md', 'project', 'engine'),
    node('projects/studio.md', 'project', 'studio'),
    node('rules/a.md', 'rule'),
    node('rules/b.md', 'rule'),
    ...Array.from({ length: 6 }, (_, i) => node(`sessions/engine/2026-10-1${i}.md`, 'session', 'engine', i)),
    node('sessions/studio/x.md', 'session', 'studio', 1),
  ]

  it('puts the current project in the center, rules above, newest sessions nearest', () => {
    const p = layout(nodes, 'engine')
    const at = (id: string) => p.find((n) => n.id === id)!
    expect(at('projects/engine.md')).toMatchObject({ x: 0, y: 0 })
    expect(at('rules/a.md').y).toBeLessThan(0)
    const dist = (id: string) => Math.hypot(at(id).x, at(id).y)
    expect(dist('sessions/engine/2026-10-15.md')).toBeLessThan(dist('sessions/engine/2026-10-10.md'))
    // another project and its sessions sit together, further out
    expect(dist('projects/studio.md')).toBeGreaterThan(dist('sessions/engine/2026-10-10.md'))
    expect(Math.hypot(at('sessions/studio/x.md').x - at('projects/studio.md').x, at('sessions/studio/x.md').y - at('projects/studio.md').y)).toBeLessThan(60)
    expect(p).toHaveLength(nodes.length)
  })

  it('sizes sessions by what they cost and labels only the newest', () => {
    const p = layout(nodes, 'engine').filter((n) => n.project === 'engine' && n.kind === 'session')
    expect(p.filter((n) => n.label)).toHaveLength(3)
    expect(p.find((n) => n.usd === 5)!.r).toBeGreaterThan(p.find((n) => n.usd === 0)!.r)
  })

  it('finds neighbors', () => {
    expect([...neighbors([{ a: 'x', b: 'y', why: 'files', weight: 1 }, { a: 'z', b: 'x', why: 'link', weight: 1 }], 'x')].sort()).toEqual(['x', 'y', 'z'])
  })
})
