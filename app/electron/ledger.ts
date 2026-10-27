// The savings ledger: per day, what each saving source kept off the bill, next to what was billed,
// so the app can draw where the money did not go. Each source says how it knows: measured from the
// API's own numbers, read from the tool's own stats, or estimated. Plain file, no secrets.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { priceOf } from '../shared/prices.js'
export { priceOf }

export type Source = 'condenser' | 'cache' | 'local-model' | 'headroom' | 'web-reader' | 'reread' | 'compactor' | 'scripts' | 'symbolic'
export const SOURCES: { id: Source; name: string; what: string; method: 'measured' | 'from the tool' | 'estimated' }[] = [
  { id: 'cache', name: 'Prompt cache', what: 'Anthropic re-reads the unchanged start of the conversation at a tenth of the price.', method: 'measured' },
  { id: 'condenser', name: 'Output condenser', what: 'Long command output (tests, builds, installs) becomes the lines that matter; the full log stays on disk.', method: 'measured' },
  { id: 'headroom', name: 'Headroom', what: 'Compresses tool output, logs, JSON and files before they are sent.', method: 'from the tool' },
  { id: 'local-model', name: 'Local model', what: 'Small tasks (commit messages, replies, the router) run on this Mac through Ollama.', method: 'measured' },
  { id: 'reread', name: 'Re-reads', what: 'A second read of a file that has not changed since the last one is answered with a note: its text is still in the conversation. Counted at the file’s size.', method: 'estimated' },
  { id: 'compactor', name: 'Context compactor', what: 'What the app adds to a prompt (memory, document passages) without repeats: repeated lines counted, JSON lists as tables, paragraphs already sent pointed to. Nothing is lost.', method: 'measured' },
  { id: 'scripts', name: 'Scripts', what: 'run_code read a big log or JSON in the project; only what the script printed went to Claude.', method: 'measured' },
  { id: 'symbolic', name: 'Short-term compression', what: 'A long tool result reached Claude as one line and a summary by rules; the original stayed on disk and came back on a click.', method: 'measured' },
  { id: 'web-reader', name: 'Web reader', what: 'Pages arrive as clean text instead of raw HTML.', method: 'estimated' },
]

type Cell = { tokens: number; usd: number }
export type Day = { billedUsd: number; billedTokens: number; saved: Partial<Record<Source, Cell>>; lapsed?: { count: number; usd: number } }
export type Ledger = Record<string, Day>

export const dayKey = (t = Date.now()) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ledger(file: string) {
  const read = (): Ledger => {
    try {
      return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Ledger) : {}
    } catch {
      return {}
    }
  }
  const change = (fn: (d: Day) => void, t = Date.now()) => {
    const all = read()
    const k = dayKey(t)
    const d = all[k] ?? { billedUsd: 0, billedTokens: 0, saved: {} }
    fn(d)
    all[k] = d
    writeFileSync(file, JSON.stringify(all))
  }
  return {
    read,
    /** A billed turn: what it cost, and what the cache read saved against full input price. */
    turn(model: string, costUsd: number, tokens: number, cacheRead: number, t = Date.now()) {
      const [, input, cached] = priceOf(model, tokens)
      change((d) => {
        d.billedUsd += costUsd
        d.billedTokens += tokens
        if (cacheRead > 0) add(d, 'cache', cacheRead, (cacheRead * (input - cached)) / 1e6)
      }, t)
    },
    /** A turn that found the cache lapsed and wrote the context again: what that cost beyond a warm read. */
    lapse(usd: number, t = Date.now()) {
      if (!(usd > 0)) return
      change((d) => (d.lapsed = { count: (d.lapsed?.count ?? 0) + 1, usd: (d.lapsed?.usd ?? 0) + usd }), t)
    },
    /** Tokens a source kept out; what they would have cost at the model's input price, once. */
    save(source: Source, tokens: number, model = '', usd?: number, t = Date.now()) {
      if (!(tokens > 0)) return
      const [, input] = priceOf(model)
      change((d) => add(d, source, tokens, usd ?? (tokens * input) / 1e6), t)
    },
  }
}
const add = (d: Day, s: Source, tokens: number, usd: number) => {
  const c = d.saved[s] ?? { tokens: 0, usd: 0 }
  d.saved[s] = { tokens: c.tokens + Math.round(tokens), usd: c.usd + usd }
}

export type Summary = { lapsed: { count: number; usd: number }; billedUsd: number; billedTokens: number; savedUsd: number; savedTokens: number; bySource: { id: Source; tokens: number; usd: number }[]; days: { day: string; billedUsd: number; savedUsd: number }[] }

/** The days since `from` (a day key) added up, sources largest first. */
export function summarize(l: Ledger, from: string): Summary {
  const days = Object.keys(l).filter((k) => k >= from).sort()
  const by: Partial<Record<Source, Cell>> = {}
  let billedUsd = 0
  let billedTokens = 0
  for (const k of days) {
    billedUsd += l[k]!.billedUsd
    billedTokens += l[k]!.billedTokens
    for (const [s, c] of Object.entries(l[k]!.saved) as [Source, Cell][]) by[s] = { tokens: (by[s]?.tokens ?? 0) + c.tokens, usd: (by[s]?.usd ?? 0) + c.usd }
  }
  const bySource = (Object.entries(by) as [Source, Cell][]).map(([id, c]) => ({ id, ...c })).sort((a, b) => b.usd - a.usd)
  const lapsed = { count: 0, usd: 0 }
  for (const k of days) {
    lapsed.count += l[k]!.lapsed?.count ?? 0
    lapsed.usd += l[k]!.lapsed?.usd ?? 0
  }
  return {
    lapsed,
    billedUsd,
    billedTokens,
    savedUsd: bySource.reduce((n, s) => n + s.usd, 0),
    savedTokens: bySource.reduce((n, s) => n + s.tokens, 0),
    bySource,
    days: days.map((day) => ({ day, billedUsd: l[day]!.billedUsd, savedUsd: Object.values(l[day]!.saved).reduce((n, c) => n + (c?.usd ?? 0), 0) })),
  }
}
