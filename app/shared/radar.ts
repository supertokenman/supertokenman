// Phase 109: a radar of topics over the feeds the person already reads. Each group is a set of words
// (with synonyms) and exclusions; items are counted per group in a time window and ranked by how often
// the group appears, weighted by the source. "Only new" counts what arrived since the last summary.
// Nothing here posts anywhere: the summary is a draft, and a notification goes only to the person.
import type { FeedItem } from './feeds.js'

export type Group = { name: string; words: string[]; exclude?: string[] }
export type Hit = { group: string; count: number; score: number; sources: number; items: { id: string; title: string; source: string; link: string; date: string }[] }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** A word matches as a whole word; a phrase as a phrase; a trailing * matches a prefix. */
const matcher = (w: string) => {
  const t = norm(w.trim())
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*$/, '\\w*')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(?=$|[^\\p{L}\\p{N}])`, 'u')
}

/** Parse the groups file: a line per group, `Name: word, synonym, phrase two | -exclude, -other`. */
export function parseGroups(text: string): Group[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).flatMap((l) => {
    const m = /^([^:]{1,60}):\s*(.+)$/.exec(l)
    if (!m) return []
    const parts = m[2]!.split(/[,|]/).map((x) => x.trim()).filter(Boolean)
    const words = parts.filter((p) => !p.startsWith('-'))
    const exclude = parts.filter((p) => p.startsWith('-')).map((p) => p.slice(1).trim()).filter(Boolean)
    return words.length ? [{ name: m[1]!.trim(), words, exclude }] : []
  })
}

export function radar(items: FeedItem[], groups: Group[], o: { since?: number; now?: number; windowMs?: number; weight?: (source: string) => number } = {}): Hit[] {
  const now = o.now ?? Date.now()
  const from = Math.max(o.since ?? 0, now - (o.windowMs ?? 24 * 3600_000))
  const fresh = items.filter((i) => {
    const t = Date.parse(i.date)
    return Number.isFinite(t) && t > from && t <= now + 60_000
  })
  const hits = groups.map((g) => {
    const ins = g.words.map(matcher)
    const outs = (g.exclude ?? []).map(matcher)
    const found = fresh.filter((i) => {
      const text = norm(`${i.title} ${i.summary ?? ''}`)
      return ins.some((r) => r.test(text)) && !outs.some((r) => r.test(text))
    })
    const score = found.reduce((a, i) => a + (o.weight?.(i.source) ?? 1), 0)
    return { group: g.name, count: found.length, score, sources: new Set(found.map((i) => i.source)).size, items: found.slice(0, 8).map(({ id, title, source, link, date }) => ({ id, title, source, link, date })) }
  })
  return hits.filter((h) => h.count).sort((a, b) => b.score - a.score || b.sources - a.sources || a.group.localeCompare(b.group))
}

/** A plain draft of the radar, for the person to read or send to themselves. */
export function draft(hits: Hit[], label: string): string {
  if (!hits.length) return `${label}: nothing from your groups.`
  return [`${label}:`, ...hits.map((h) => `- ${h.group}: ${h.count} item${h.count === 1 ? '' : 's'} from ${h.sources} source${h.sources === 1 ? '' : 's'}. Top: ${h.items[0]!.title} (${h.items[0]!.source})`)].join('\n')
}
