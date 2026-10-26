// Memory items that are only ever added (phase 85): editing makes a new version that points at the old
// one, archiving hides without deleting. "Now" shows the latest version of each item; "history" shows
// all. Search fuses words (BM25), meaning (local embeddings when set) and named things in the project
// (files, packages, symbols) with reciprocal rank fusion. Never about people.
// Idea from mem0's add-only memory and fused retrieval; our own code.
import { bm25 } from './research.js'

export type Origin = 'you' | 'agent' | 'session'
export type MemItem = { id: string; text: string; at: number; origin: Origin; project: string; supersedes?: string; archived?: boolean; entities: string[] }

/** Named things in a text: file paths, packages, commands and code symbols. */
export function entitiesOf(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/(?:^|[\s`'"(])((?:[\w.-]+\/)+[\w.-]+\.\w{1,6}|[\w-]+\.(?:ts|tsx|js|mjs|json|py|go|rs|md|yaml|yml|toml|sql))(?=$|[\s`'"),.;:])/g)) out.add(m[1]!.toLowerCase())
  for (const m of text.matchAll(/`([^`\s]{2,60})`/g)) out.add(m[1]!.toLowerCase())
  for (const m of text.matchAll(/\b(@[\w-]+\/[\w.-]+|(?:npm|pnpm|yarn|bun|pip|cargo|brew)\s+(?:i|install|add)\s+([\w@/.-]+))/g)) out.add((m[2] ?? m[1])!.toLowerCase())
  for (const m of text.matchAll(/\b([a-z]+[A-Z]\w*|[A-Z][a-z]+[A-Z]\w*)\b/g)) out.add(m[1]!.toLowerCase())
  return [...out].slice(0, 30)
}

export function add(list: MemItem[], text: string, origin: Origin, project: string, now: number, supersedes?: string): MemItem[] {
  const t = text.trim()
  if (!t) return list
  return [...list, { id: `m${now.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, text: t, at: now, origin, project, ...(supersedes ? { supersedes } : {}), entities: entitiesOf(t) }]
}
/** An edit is a new item that supersedes the old one; the old one stays in history. */
export const edit = (list: MemItem[], id: string, text: string, origin: Origin, now: number) => {
  const old = list.find((x) => x.id === id)
  return old ? add(list, text, origin, old.project, now, id) : list
}
export const archive = (list: MemItem[], id: string, on: boolean) => list.map((x) => (x.id === id ? { ...x, archived: on } : x))

/** The current state: the newest version of each chain, not archived. */
export function now(list: MemItem[]): MemItem[] {
  const replaced = new Set(list.filter((x) => x.supersedes).map((x) => x.supersedes!))
  return list.filter((x) => !replaced.has(x.id) && !x.archived)
}
/** Every version of an item, oldest first. */
export function chainOf(list: MemItem[], id: string): MemItem[] {
  const byId = new Map(list.map((x) => [x.id, x]))
  const back: MemItem[] = []
  for (let cur = byId.get(id); cur; cur = cur.supersedes ? byId.get(cur.supersedes) : undefined) back.unshift(cur)
  let tip = back[back.length - 1]
  for (let next = tip && list.find((x) => x.supersedes === tip!.id); next; next = list.find((x) => x.supersedes === next!.id)) (back.push(next), (tip = next))
  return back
}

/** Reciprocal rank fusion of several rankings (lists of ids, best first). */
export function rrf(rankings: string[][], k = 60): Map<string, number> {
  const score = new Map<string, number>()
  for (const r of rankings) r.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1)))
  return score
}

export type Hit = { item: MemItem; score: number; via: ('words' | 'meaning' | 'things')[] }

/** Search over items (current state or full history); vectors are optional, from a local model. */
export function search(items: MemItem[], q: string, opts: { vectors?: Map<string, number[]>; qvec?: number[]; cos?: (a: number[], b: number[]) => number; origin?: Origin[]; limit?: number } = {}): Hit[] {
  const pool = items.filter((x) => !opts.origin || opts.origin.includes(x.origin))
  if (!q.trim() || !pool.length) return []
  const words = bm25(q, pool.map((x) => x.text))
  const byWords = pool.map((x, i) => [x.id, words[i]!] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const qe = new Set(entitiesOf(q).concat(q.toLowerCase().split(/\W+/).filter((w) => w.length > 2)))
  const byThings = pool.map((x) => [x.id, x.entities.filter((e) => qe.has(e) || [...qe].some((w) => e.includes(w) && w.length > 3)).length] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const byMeaning = opts.qvec && opts.vectors && opts.cos ? pool.filter((x) => opts.vectors!.has(x.id)).map((x) => [x.id, opts.cos!(opts.qvec!, opts.vectors!.get(x.id)!)] as const).filter(([, s]) => s > 0.3).sort((a, b) => b[1] - a[1]).map(([id]) => id) : []
  const fused = rrf([byWords, byMeaning, byThings])
  const byId = new Map(pool.map((x) => [x.id, x]))
  return [...fused.entries()]
    .map(([id, score]) => ({ item: byId.get(id)!, score, via: [...(byWords.includes(id) ? ['words' as const] : []), ...(byMeaning.includes(id) ? ['meaning' as const] : []), ...(byThings.includes(id) ? ['things' as const] : [])] }))
    // the same score: the newer item states the present
    .sort((a, b) => b.score - a.score || b.item.at - a.item.at)
    .slice(0, opts.limit ?? 20)
}
