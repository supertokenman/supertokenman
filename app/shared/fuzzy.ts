// Fuzzy ranking for the in-app file picker: the name counts more than the folder it is in.

/** A score for `query` against `text` (higher is better), or -1 when its letters are not all there in order. */
export function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return 0
  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - t.length
  const at = t.indexOf(q)
  if (at >= 0) return 600 - at - t.length / 10
  let score = 0
  let i = 0
  let prev = -2
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] !== q[i]) continue
    // letters next to each other, and letters starting a word, count more
    score += j === prev + 1 ? 6 : 1
    if (j === 0 || /[\s/._-]/.test(t[j - 1]!)) score += 4
    prev = j
    i++
  }
  return i === q.length ? score : -1
}

/** Ranks items by `query` against their name, then their path; items that do not match are left out. */
export function fuzzyRank<T>(items: T[], query: string, name: (t: T) => string, path: (t: T) => string, max = 200): T[] {
  const q = query.trim()
  if (!q) return items.slice(0, max)
  return items
    .map((it, i) => {
      const n = fuzzyScore(name(it), q)
      const p = fuzzyScore(path(it), q)
      return { it, i, s: n >= 0 ? n + 2000 : p >= 0 ? p : -1 }
    })
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .map((x) => x.it)
}
