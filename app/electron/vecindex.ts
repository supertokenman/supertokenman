// The memory's meaning index: each memory entry as a vector from a local embedding model (Ollama),
// kept in a file per project and redone only for entries that changed. A query finds entries by
// meaning, not only by shared words. Nothing leaves the machine.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { MemNode } from './memtree.js'
import { OLLAMA } from './small.js'

type Store = { model: string; items: Record<string, { h: string; v: number[] }> }

const hashOf = (n: MemNode) => createHash('sha1').update(`${n.title}\n${n.summary}\n${n.body.slice(0, 4000)}`).digest('hex').slice(0, 12)
const textOf = (n: MemNode) => `${n.title}\n${n.summary}\n${n.body.slice(0, 2000)}`

export async function embed(model: string, input: string[], doFetch: typeof fetch = fetch): Promise<number[][]> {
  const r = await doFetch(`${OLLAMA}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input }) })
  if (!r.ok) throw new Error(`The embedding model answered ${r.status}. Pull it in Local model first.`)
  const j = (await r.json()) as { embeddings?: number[][] }
  if (!j.embeddings?.length) throw new Error('The embedding model gave no vectors.')
  return j.embeddings
}

export function cosine(a: number[], b: number[]): number {
  let d = 0
  let x = 0
  let y = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    d += a[i]! * b[i]!
    x += a[i]! * a[i]!
    y += b[i]! * b[i]!
  }
  return x && y ? d / Math.sqrt(x * y) : 0
}

function load(file: string, model: string): Store {
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as Store
    return s.model === model ? s : { model, items: {} }
  } catch {
    return { model, items: {} }
  }
}

/** Brings the index up to date with the entries; returns how many there are and how many were (re)done. */
export async function buildIndex(file: string, model: string, nodes: MemNode[], doFetch: typeof fetch = fetch): Promise<{ total: number; done: number }> {
  const s = load(file, model)
  const ids = new Set(nodes.map((n) => n.id))
  for (const id of Object.keys(s.items)) if (!ids.has(id)) delete s.items[id]
  const todo = nodes.filter((n) => s.items[n.id]?.h !== hashOf(n))
  for (let i = 0; i < todo.length; i += 16) {
    const chunk = todo.slice(i, i + 16)
    const v = await embed(model, chunk.map(textOf), doFetch)
    chunk.forEach((n, k) => (s.items[n.id] = { h: hashOf(n), v: v[k]! }))
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(s))
  return { total: nodes.length, done: todo.length }
}

/** The entries closest in meaning to the query, best first, from the index as it is. */
export async function searchIndex(file: string, model: string, nodes: MemNode[], query: string, k = 12, doFetch: typeof fetch = fetch): Promise<{ node: MemNode; score: number }[]> {
  const s = load(file, model)
  if (!Object.keys(s.items).length) return []
  const [q] = await embed(model, [query], doFetch)
  return nodes
    .filter((n) => s.items[n.id])
    .map((n) => ({ node: n, score: cosine(q!, s.items[n.id]!.v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

/** How many entries the index holds for this model. */
export function indexSize(file: string, model: string) {
  return Object.keys(load(file, model).items).length
}
