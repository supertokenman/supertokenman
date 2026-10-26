// Phase 121: the project as a graph (idea from Cognee, none of its code): services, modules, tables,
// ADRs and kept decisions, with what imports, uses or stores what, and which decisions touch which
// part. Everything comes from structure the app already reads; no model is asked to extract it.
// Entities are code and documents only, never people.
import type { BackendMap, SourceFile } from './backendmap.js'

export type NKind = 'service' | 'module' | 'table' | 'store' | 'adr' | 'decision'
export type Rel = 'contains' | 'imports' | 'uses' | 'stores' | 'touches'
export type GNode = { id: string; kind: NKind; label: string; detail?: string }
export type GEdge = { from: string; to: string; rel: Rel }
export type Graph = { nodes: GNode[]; edges: GEdge[] }
export type Doc = { kind: 'adr' | 'decision'; id: string; title: string; text: string; date?: string }

/** Relations that mean "needs": following them backwards answers "what depends on X". */
export const NEEDS: Rel[] = ['imports', 'uses', 'stores']

const norm = (p: string) => p.split('/').reduce<string[]>((a, s) => (s === '..' ? a.slice(0, -1) : s === '.' || !s ? a : [...a, s]), []).join('/')
const dirOf = (p: string) => p.split('/').slice(0, -1).join('/')

/** The module a file belongs to: its service's folder plus the first folder below the source root. */
export function moduleOf(path: string, serviceDir: string): string {
  const rest = (serviceDir ? path.slice(serviceDir.length + 1) : path).split('/')
  // a folder under src/app/lib is the module; a file straight in one of them belongs to that root
  const root = rest[0] === 'src' || rest[0] === 'app' || rest[0] === 'lib'
  const parts = root && rest.length > 2 ? rest.slice(0, 2) : rest.length > 1 ? rest.slice(0, 1) : []
  const mod = parts.join('/') || '(root)'
  return serviceDir ? `${serviceDir}/${mod}` : mod
}

const IMPORT_RE = [/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g, /\brequire\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g, /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g, /^\s*from\s+(\.+[\w.]*)\s+import\b/gm]
/** Relative imports of a file, as project paths without extension. */
export function importsOf(f: SourceFile): string[] {
  const out: string[] = []
  for (const re of IMPORT_RE) for (const m of f.text.matchAll(re)) {
    const spec = m[1]!
    if (spec.startsWith('.') && !spec.includes('/') && f.path.endsWith('.py')) {
      const up = spec.match(/^\.+/)![0].length - 1
      const base = dirOf(f.path).split('/').slice(0, up ? -up : undefined).join('/')
      out.push(norm(`${base}/${spec.replace(/^\.+/, '').replace(/\./g, '/')}`))
    } else out.push(norm(`${dirOf(f.path)}/${spec}`).replace(/\.(m?[jt]sx?|py)$/, ''))
  }
  return out
}

const SQL_TABLE = [/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`]?(?:\w+\.)?([a-z_][a-z0-9_]*)/gi, /\b(?:from|join|into|update)\s+["`]?([a-z_][a-z0-9_]*)["`]?(?=[\s;,)(]|$)/gi]
const ORM_TABLE = [/\b(?:pgTable|sqliteTable|mysqlTable)\(\s*['"]([\w]+)['"]/g, /^model\s+(\w+)\s*\{/gm, /__tablename__\s*=\s*['"](\w+)['"]/g]
const NOT_TABLES = new Set(['select', 'where', 'set', 'values', 'the', 'a', 'an', 'this', 'that', 'dual', 'json', 'unnest', 'lateral', 'generate_series', 'information_schema', 'pg_catalog', 'sqlite_master', 'react', 'node', 'import', 'export', 'default', 'require', 'module', 'it', 'them', 'here', 'there'])
/** Table names a file creates or queries: SQL in .sql files or in strings that look like SQL, and ORM schemas. */
export function tablesOf(f: SourceFile): string[] {
  const found = new Set<string>()
  const sqlText = f.path.endsWith('.sql') ? f.text : (f.text.match(/(['"`])\s*(?:select|insert|update|delete|create\s+table|with)\b[\s\S]*?\1/gi) ?? []).join('\n')
  for (const re of SQL_TABLE) for (const m of sqlText.matchAll(re)) if (!NOT_TABLES.has(m[1]!.toLowerCase())) found.add(m[1]!.toLowerCase())
  for (const re of ORM_TABLE) for (const m of f.text.matchAll(re)) found.add(m[1]!.toLowerCase())
  return [...found]
}

/** Whole-word, case-insensitive mention of a name in a text; names under three letters never match. */
const mentions = (text: string, name: string) => name.length >= 3 && new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^\\w-])`, 'i').test(text)

/** The graph from the backend map, the source files, the ADRs and the kept decisions. */
export function build(map: BackendMap, files: SourceFile[], docs: Doc[]): Graph {
  const nodes = new Map<string, GNode>()
  const edges = new Map<string, GEdge>()
  const node = (n: GNode) => (nodes.has(n.id) ? nodes.get(n.id)! : (nodes.set(n.id, n), n))
  const edge = (from: string, to: string, rel: Rel) => from !== to && edges.set(`${from}|${to}|${rel}`, { from, to, rel })
  const services = [...map.services].sort((a, b) => b.dir.length - a.dir.length)
  const svcOf = (p: string) => services.find((s) => s.dir === '' || p === s.dir || p.startsWith(`${s.dir}/`))
  for (const s of map.services) {
    node({ id: `service:${s.name}`, kind: 'service', label: s.name, detail: `${s.dir || '.'} · ${s.routes.length} routes` })
    for (const st of s.stores) (node({ id: `store:${st}`, kind: 'store', label: st }), edge(`service:${s.name}`, `store:${st}`, 'stores'))
  }
  for (const s of map.services) for (const u of s.uses) if (nodes.has(`service:${u}`)) edge(`service:${s.name}`, `service:${u}`, 'uses')
  const fileMod = new Map<string, string>()
  for (const f of files) {
    const s = svcOf(f.path)
    const mod = moduleOf(f.path, s?.dir ?? '')
    fileMod.set(f.path.replace(/\.(m?[jt]sx?|py|sql|prisma)$/, ''), mod)
    node({ id: `module:${mod}`, kind: 'module', label: mod })
    if (s && nodes.has(`service:${s.name}`)) edge(`service:${s.name}`, `module:${mod}`, 'contains')
  }
  for (const f of files) {
    const from = `module:${fileMod.get(f.path.replace(/\.(m?[jt]sx?|py|sql|prisma)$/, ''))}`
    for (const imp of importsOf(f)) {
      const target = fileMod.get(imp) ?? fileMod.get(`${imp}/index`) ?? fileMod.get(`${imp}/__init__`)
      if (target) edge(from, `module:${target}`, 'imports')
    }
    for (const t of tablesOf(f)) (node({ id: `table:${t}`, kind: 'table', label: t }), edge(from, `table:${t}`, 'stores'))
  }
  const targets = [...nodes.values()].filter((n) => n.kind !== 'adr' && n.kind !== 'decision')
  for (const d of docs) {
    const id = `${d.kind}:${d.id}`
    node({ id, kind: d.kind, label: d.title, detail: d.date })
    const text = `${d.title}\n${d.text}`
    for (const t of targets) {
      const short = t.kind === 'module' ? t.label.split('/').pop()! : t.label
      if (mentions(text, t.label) || (t.kind === 'module' && short !== '(root)' && mentions(text, short))) edge(id, t.id, 'touches')
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

/** A node by what the person typed: its id, its exact label, or the one label that contains it. */
export function find(g: Graph, q: string): GNode | null {
  const t = q.trim().toLowerCase().replace(/^["'`]|["'`?.]$/g, '')
  if (!t) return null
  return g.nodes.find((n) => n.id.toLowerCase() === t) ?? g.nodes.find((n) => n.label.toLowerCase() === t) ?? g.nodes.find((n) => n.kind === 'module' && n.label.toLowerCase().endsWith(`/${t}`)) ?? g.nodes.filter((n) => n.label.toLowerCase().includes(t)).sort((a, b) => a.label.length - b.label.length)[0] ?? null
}

export type Ask = { kind: 'depends' | 'decisions' | 'both'; target: string }
/** "@graph what depends on billing", "@graph decisions about orders", "@graph billing". */
export function parseAsk(text: string): Ask | null {
  const m = /@graph\b\s*([^\n]*)/i.exec(text)
  if (!m) return null
  const q = m[1]!.trim()
  const target = (/(?:depends? on|uses|imports|about|touch(?:es|ing)?|for|of|on)\s+(.+)$/i.exec(q)?.[1] ?? q).trim().replace(/[?.!]+$/, '')
  if (!target) return null
  const kind = /depend|uses|imports|need/i.test(q) ? 'depends' : /decision|adr|decid|touch/i.test(q) ? 'decisions' : 'both'
  return { kind, target }
}
