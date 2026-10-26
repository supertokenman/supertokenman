// ROUGE: how much two texts share, by words (ROUGE-1), word pairs (ROUGE-2) and the longest common
// word sequence (ROUGE-L). Free and the same every time; used to compare two answers and to measure
// what compression kept.

export type Rouge = { p: number; r: number; f: number }

export const toks = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

const prf = (hit: number, cand: number, ref: number): Rouge => {
  const p = cand ? hit / cand : 0
  const r = ref ? hit / ref : 0
  return { p, r, f: p + r ? (2 * p * r) / (p + r) : 0 }
}

function grams(t: string[], n: number) {
  const m = new Map<string, number>()
  for (let i = 0; i + n <= t.length; i++) {
    const k = t.slice(i, i + n).join(' ')
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/** ROUGE-N of a candidate against a reference. */
export function rougeN(cand: string, ref: string, n = 1): Rouge {
  const c = grams(toks(cand), n)
  const r = grams(toks(ref), n)
  let hit = 0
  for (const [k, v] of c) hit += Math.min(v, r.get(k) ?? 0)
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
  return prf(hit, sum(c), sum(r))
}

/** ROUGE-L: the longest common subsequence of words; long texts are cut to keep it fast. */
export function rougeL(cand: string, ref: string, max = 3000): Rouge {
  const a = toks(cand).slice(0, max)
  const b = toks(ref).slice(0, max)
  let prev = new Uint16Array(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Uint16Array(b.length + 1)
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!)
    prev = cur
  }
  return prf(prev[b.length]!, a.length, b.length)
}

export const pct = (x: number) => Math.round(x * 100)
