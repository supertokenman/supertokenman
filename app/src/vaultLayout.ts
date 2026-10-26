// The vault map's layout, a pure function of the graph: the current project at the center, rules on
// an arc above, other projects on an outer ring with their sessions in a tight orbit, and this
// project's sessions on a golden-angle spiral, newest nearest the center.
import type { GraphEdge, GraphNode } from '../electron/memory'

export type Placed = GraphNode & { x: number; y: number; r: number; label: boolean }

const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const size = (n: GraphNode) => (n.kind === 'project' ? 16 : n.kind === 'rule' ? 8 : Math.min(13, 4 + Math.sqrt(n.usd) * 2.6))

export function layout(nodes: GraphNode[], project: string): Placed[] {
  const out: Placed[] = []
  const put = (n: GraphNode, x: number, y: number, label: boolean) => out.push({ ...n, x, y, r: size(n), label })
  const center = nodes.find((n) => n.kind === 'project' && n.project === project)
  if (center) put(center, 0, 0, true)

  const rules = nodes.filter((n) => n.kind === 'rule')
  rules.forEach((n, i) => {
    const a = -Math.PI / 2 + (rules.length > 1 ? (i / (rules.length - 1) - 0.5) * (Math.PI * 0.7) : 0)
    put(n, Math.cos(a) * 170, Math.sin(a) * 170, true)
  })

  const mine = nodes.filter((n) => n.kind === 'session' && n.project === project).sort((a, b) => b.id.localeCompare(a.id))
  mine.forEach((n, i) => {
    const a = Math.PI / 2 + i * GOLDEN
    const d = 70 + 26 * Math.sqrt(i + 1) * 2.2
    put(n, Math.cos(a) * d, Math.sin(a) * d * 0.82, i < 3)
  })

  const others = nodes.filter((n) => n.kind === 'project' && n.project !== project)
  const ring = Math.max(330, 70 + 26 * Math.sqrt(mine.length + 1) * 2.2 + 90)
  others.forEach((p, i) => {
    const a = Math.PI / 2 + ((i + 0.5) / others.length - 0.5) * Math.PI * 1.1
    const px = Math.cos(a) * ring
    const py = Math.sin(a) * ring * 0.82
    put(p, px, py, true)
    nodes
      .filter((n) => n.kind === 'session' && n.project === p.project)
      .forEach((n, j) => {
        const b = j * GOLDEN
        const d = 26 + 9 * Math.sqrt(j + 1)
        put(n, px + Math.cos(b) * d, py + Math.sin(b) * d, false)
      })
  })

  // sessions of a project with no note of its own: a loose cluster below
  const placed = new Set(out.map((n) => n.id))
  nodes
    .filter((n) => !placed.has(n.id))
    .forEach((n, i) => {
      const b = i * GOLDEN
      put(n, Math.cos(b) * (ring + 60 + 8 * Math.sqrt(i)), Math.sin(b) * (ring * 0.82 + 40), false)
    })
  return out
}

/** The ids joined to `id`, for highlighting on hover. */
export function neighbors(edges: GraphEdge[], id: string): Set<string> {
  const s = new Set([id])
  for (const e of edges) {
    if (e.a === id) s.add(e.b)
    if (e.b === id) s.add(e.a)
  }
  return s
}
