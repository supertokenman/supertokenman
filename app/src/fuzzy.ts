// The ⌘K search: one box that reaches every place in the app. Matching is by letters in order, with
// a bonus for word starts and runs, so "prq" finds "Pull requests" and "dock" finds "Docker".

export type Entry = { id: string; group: string; label: string; hint?: string; keywords?: string; run: () => void }

/** How well `q` matches `text`: 0 is no match; higher is better. */
export function score(q: string, text: string): number {
  const query = q.toLowerCase().trim()
  if (!query) return 1
  const t = text.toLowerCase()
  if (t.startsWith(query)) return 1000 - t.length
  const at = t.indexOf(query)
  if (at >= 0) return 800 - at - t.length / 10
  let s = 0
  let i = 0
  let run = 0
  for (let j = 0; j < t.length && i < query.length; j++) {
    if (t[j] === query[i]) {
      run++
      s += 10 + run * 5 + (j === 0 || /[\s/._-]/.test(t[j - 1]!) ? 25 : 0)
      i++
    } else run = 0
  }
  return i === query.length ? s : 0
}

/** The best entries for a query, best first, at most `limit`. */
export function search(entries: Entry[], q: string, limit = 12): Entry[] {
  if (!q.trim()) return entries.slice(0, limit)
  return entries
    .map((e) => ({ e, s: Math.max(score(q, e.label), score(q, e.keywords ?? '') * 0.8, score(q, e.hint ?? '') * 0.5) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.e)
}

/** Results kept in score order inside each group, the groups ordered by their best result. */
export function grouped(results: Entry[]): Entry[] {
  const order: string[] = []
  for (const r of results) if (!order.includes(r.group)) order.push(r.group)
  return order.flatMap((g) => results.filter((r) => r.group === g))
}
