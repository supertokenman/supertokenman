// What Headroom's compression kept: for each recent request the proxy logged, how much of the text it
// changed survived (ROUGE-L recall), how many error lines are still there, and whether what it cut can
// be fetched back (its "Retrieve more" marker).
import { execFile } from 'node:child_process'
import { pct, rougeL } from '../shared/rouge.js'

type Block = { type?: string; text?: string; content?: unknown }
type Msg = { role: string; content: string | Block[] }
export type Inspected = { request_id: string; timestamp: string; tokens_saved: number; savings_percent: number; transforms_applied: string[]; request_messages: Msg[]; compressed_messages: Msg[] }
export type Quality = { id: string; at: string; saved: number; percent: number; changed: number; kept: number; errors: number; errorsKept: number; retrievable: boolean; transforms: string[] }

const textOf = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b: Block) => (typeof b === 'string' ? b : b.text ?? textOf(b.content))).join('\n') : '')
const ERR = /\b(?:error|err!|fail(?:ed|ure)?|exception|traceback|panic|fatal|denied|refused|cannot|undefined is not)\b/i

/** One request's quality, from its messages before and after compression. */
export function quality(r: Inspected): Quality {
  let kept = 0
  let total = 0
  let errors = 0
  let errorsKept = 0
  let retrievable = false
  let changed = 0
  // some logged requests (token counts, health checks) carry no messages
  const after_ = r.compressed_messages ?? []
  ;(r.request_messages ?? []).forEach((m, i) => {
    const before = textOf(m?.content)
    const after = textOf(after_[i]?.content)
    if (before === after) return
    changed++
    const words = Math.max(1, before.split(/\s+/).length)
    kept += rougeL(after, before).r * words
    total += words
    if (/Retrieve more: hash=|headroom_retrieve/.test(after)) retrievable = true
    const errLines = before.split('\n').filter((l) => ERR.test(l))
    errors += errLines.length
    errorsKept += errLines.filter((l) => after.includes(l.trim())).length
  })
  return { id: r.request_id, at: r.timestamp, saved: r.tokens_saved ?? 0, percent: Math.round(r.savings_percent ?? 0), changed, kept: total ? pct(kept / total) : 100, errors, errorsKept, retrievable, transforms: r.transforms_applied ?? [] }
}

/** The last requests the proxy logged; empty when it was not started with message logging. */
export function inspect(bin: string, port: number, last = 10): Promise<Quality[]> {
  return new Promise((ok) => {
    execFile(bin, ['inspect', '--port', String(port), '--last', String(last), '--format', 'json'], { timeout: 30_000, maxBuffer: 64 << 20, env: { ...process.env, HEADROOM_BEACON: 'off', HEADROOM_TELEMETRY: 'off' } }, (err, out) => {
      if (err) return ok([])
      try {
        ok((JSON.parse(out) as Inspected[]).map(quality))
      } catch {
        ok([])
      }
    })
  })
}
