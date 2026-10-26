// Phase 121: the project graph kept in SQLite (nodes and edges), one file per project, and the two
// questions it answers: what depends on X, and which decisions touch Y. Both follow X's contents too
// (a service's modules), so asking about a service covers the code inside it.
import { createRequire } from 'node:module'
import { NEEDS, find, parseAsk, type GEdge, type GNode, type Graph } from '../shared/projgraph.js'
// loaded through require: the test runner's bundler does not know node:sqlite yet
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

export type Dependent = GNode & { depth: number }

export class GraphStore {
  private db: import('node:sqlite').DatabaseSync
  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec(`create table if not exists nodes (id text primary key, kind text not null, label text not null, detail text);
      create table if not exists edges (from_id text not null, to_id text not null, rel text not null, primary key (from_id, to_id, rel));
      create index if not exists edges_to on edges (to_id, rel);
      create table if not exists meta (k text primary key, v text)`)
  }
  save(g: Graph, at = Date.now()) {
    this.db.exec('begin')
    try {
      this.db.exec('delete from nodes; delete from edges')
      const n = this.db.prepare('insert into nodes (id, kind, label, detail) values (?, ?, ?, ?)')
      for (const x of g.nodes) n.run(x.id, x.kind, x.label, x.detail ?? null)
      const e = this.db.prepare('insert or ignore into edges (from_id, to_id, rel) values (?, ?, ?)')
      for (const x of g.edges) e.run(x.from, x.to, x.rel)
      this.db.prepare("insert or replace into meta (k, v) values ('built', ?)").run(String(at))
      this.db.exec('commit')
    } catch (err) {
      this.db.exec('rollback')
      throw err
    }
  }
  graph(): Graph & { built: number } {
    const nodes = this.db.prepare('select id, kind, label, detail from nodes').all().map((r) => ({ id: String(r.id), kind: r.kind, label: String(r.label), ...(r.detail ? { detail: String(r.detail) } : {}) })) as GNode[]
    const edges = this.db.prepare('select from_id, to_id, rel from edges').all().map((r) => ({ from: String(r.from_id), to: String(r.to_id), rel: r.rel })) as GEdge[]
    const built = Number(this.db.prepare("select v from meta where k = 'built'").get()?.v ?? 0)
    return { nodes, edges, built }
  }
  /** X and what X contains. */
  private start(id: string) {
    return [id, ...this.db.prepare("select to_id from edges where from_id = ? and rel = 'contains'").all(id).map((r) => String(r.to_id))]
  }
  /** Everything that needs X, directly (depth 1) or through others, up to eight steps. */
  dependents(id: string): Dependent[] {
    const seeds = this.start(id)
    const rels = NEEDS.map(() => '?').join(',')
    const rows = this.db.prepare(`with recursive up(id, depth) as (
        select from_id, 1 from edges where to_id in (${seeds.map(() => '?').join(',')}) and rel in (${rels})
        union
        select e.from_id, up.depth + 1 from edges e join up on e.to_id = up.id where e.rel in (${rels}) and up.depth < 8
      )
      select n.id, n.kind, n.label, n.detail, min(up.depth) as depth from up join nodes n on n.id = up.id
      where n.id not in (${seeds.map(() => '?').join(',')}) group by n.id order by depth, n.kind, n.label`).all(...seeds, ...NEEDS, ...NEEDS, ...seeds)
    return rows.map((r) => ({ id: String(r.id), kind: r.kind as GNode['kind'], label: String(r.label), ...(r.detail ? { detail: String(r.detail) } : {}), depth: Number(r.depth) }))
  }
  /** ADRs and kept decisions that name Y or something inside it. */
  touching(id: string): GNode[] {
    const seeds = this.start(id)
    return this.db.prepare(`select distinct n.id, n.kind, n.label, n.detail from edges e join nodes n on n.id = e.from_id where e.rel = 'touches' and e.to_id in (${seeds.map(() => '?').join(',')}) order by n.kind, n.label`).all(...seeds).map((r) => ({ id: String(r.id), kind: r.kind as GNode['kind'], label: String(r.label), ...(r.detail ? { detail: String(r.detail) } : {}) }))
  }
  /** The answer to an "@graph" line as text Claude can read, or null when the line asks nothing. */
  answer(text: string): string | null {
    const ask = parseAsk(text)
    if (!ask) return null
    const g = this.graph()
    if (!g.nodes.length) return 'The project graph is empty: open Project graph and build it first.'
    const n = find(g, ask.target)
    if (!n) return `The project graph has nothing called "${ask.target}".`
    const out = [`From the project graph (built ${new Date(g.built).toISOString().slice(0, 16).replace('T', ' ')}), about ${n.kind} ${n.label}:`]
    if (ask.kind !== 'decisions') {
      const d = this.dependents(n.id)
      out.push(d.length ? `Depends on it (${d.length}):\n${d.slice(0, 40).map((x) => `- ${x.kind} ${x.label}${x.depth > 1 ? ` (through ${x.depth - 1} other${x.depth > 2 ? 's' : ''})` : ''}`).join('\n')}` : 'Nothing in the graph depends on it.')
    }
    if (ask.kind !== 'depends') {
      const t = this.touching(n.id)
      out.push(t.length ? `Decisions that touch it (${t.length}):\n${t.slice(0, 20).map((x) => `- ${x.kind === 'adr' ? 'ADR' : 'Decision'} ${x.label}${x.detail ? ` (${x.detail})` : ''}`).join('\n')}` : 'No ADR or kept decision names it.')
    }
    out.push('The graph comes from imports, the backend map, SQL and ORM schemas, ADRs and the project memory; dynamic imports and runtime wiring are not in it.')
    return out.join('\n\n')
  }
  close() {
    this.db.close()
  }
}
