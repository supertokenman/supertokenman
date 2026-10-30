// The audit log writer: <userData>/audit/YYYY-MM-DD.jsonl, append only, one JSON row per line. Rows are built
// by shared/auditlog.ts (arguments redacted and capped before anything reaches the disk). A failed write is
// retried once and then reported through `onFail`; a decision never depends on the write.
import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { buildRow, dayOf, expired, pickFile, type AuditDecision, type AuditInput, type AuditRow } from '../shared/auditlog.js'

export const RETENTION_DEFAULT = 90
export const RETENTION_MIN = 7
export const RETENTION_MAX = 365
export const QUERY_MAX = 2000

export const retentionDays = (v: unknown): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= RETENTION_MIN ? Math.min(n, RETENTION_MAX) : RETENTION_DEFAULT
}

export type AuditQuery = { from: number; to: number; panel?: string; tool?: string; decision?: AuditDecision; text?: string; limit?: number }

export class AuditLog {
  private failed = false
  constructor(
    private dir: string,
    private opts: { known?: () => { name: string; value: string }[]; onFail?: (message: string) => void; now?: () => number } = {},
  ) {}

  private now = () => this.opts.now?.() ?? Date.now()

  private file(at: number): string {
    return join(this.dir, pickFile(dayOf(at), (n) => {
      try {
        return statSync(join(this.dir, n)).size
      } catch {
        return 0
      }
    }))
  }

  /** Appends one row. Returns false when the disk refused it twice; never throws. */
  write(input: Omit<AuditInput, 'at' | 'known' | 'v'> & { at?: number }): boolean {
    let row: AuditRow
    try {
      row = buildRow({ ...input, at: input.at ?? this.now(), known: this.opts.known?.() })
    } catch (e) {
      this.fail(e)
      return false
    }
    const line = `${JSON.stringify(row)}\n`
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        mkdirSync(this.dir, { recursive: true })
        appendFileSync(this.file(row.at), line, { flag: 'a', mode: 0o600 })
        this.failed = false
        return true
      } catch (e) {
        if (attempt === 1) this.fail(e)
      }
    }
    return false
  }

  private fail(e: unknown) {
    // one note per run of failures, not one per row
    if (this.failed) return
    this.failed = true
    this.opts.onFail?.(`The audit log could not be written: ${e instanceof Error ? e.message : String(e)}`)
  }

  /** Deletes the files older than the retention; returns the names removed. */
  purge(days: number): string[] {
    let names: string[] = []
    try {
      names = readdirSync(this.dir)
    } catch {
      return []
    }
    const old = expired(names, this.now(), retentionDays(days))
    for (const n of old) {
      try {
        unlinkSync(join(this.dir, n))
      } catch {
        // kept; the next start tries again
      }
    }
    return old
  }

  /** The days that have rows, newest first (YYYY-MM-DD). */
  days(): string[] {
    try {
      return [...new Set(readdirSync(this.dir).map((n) => /^(\d{4}-\d{2}-\d{2})(?:\.\d+)?\.jsonl$/.exec(n)?.[1]).filter((d): d is string => Boolean(d)))].sort().reverse()
    } catch {
      return []
    }
  }

  /** Rows between two times that match the filters, newest first, at most `limit` (2000). */
  query(q: AuditQuery): AuditRow[] {
    const limit = Math.max(1, Math.min(QUERY_MAX, Math.floor(q.limit ?? 500)))
    const text = q.text?.toLowerCase()
    const out: AuditRow[] = []
    let names: string[] = []
    try {
      names = readdirSync(this.dir)
    } catch {
      return []
    }
    const first = dayOf(q.from)
    const last = dayOf(q.to)
    const files = names
      .map((n) => ({ n, day: /^(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/.exec(n) }))
      .filter((f): f is { n: string; day: RegExpExecArray } => Boolean(f.day) && f.day![1]! >= first && f.day![1]! <= last)
      .sort((a, b) => (b.day[1]! + (b.day[2] ?? '1').padStart(6, '0')).localeCompare(a.day[1]! + (a.day[2] ?? '1').padStart(6, '0')))
    for (const f of files) {
      let rows: AuditRow[] = []
      try {
        rows = readFileSync(join(this.dir, f.n), 'utf8')
          .split('\n')
          .filter(Boolean)
          .flatMap((l) => {
            try {
              return [JSON.parse(l) as AuditRow]
            } catch {
              return []
            }
          })
      } catch {
        continue
      }
      for (const r of rows.reverse()) {
        if (r.at < q.from || r.at > q.to) continue
        if (q.panel && r.panel !== q.panel) continue
        if (q.tool && r.tool !== q.tool) continue
        if (q.decision && r.decision !== q.decision) continue
        if (text && !`${r.tool} ${r.args} ${r.rule ?? ''} ${r.project}`.toLowerCase().includes(text)) continue
        out.push(r)
        if (out.length >= limit) return out
      }
    }
    return out
  }
}
