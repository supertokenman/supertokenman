// The audit log's row shape and file naming. Pure: the writer in electron/audit.ts does the appends.
// One JSON object per line in <userData>/audit/YYYY-MM-DD.jsonl; a file over 50 MB continues in YYYY-MM-DD.2.jsonl.

import { redactArgs } from './auditredact.js'

export const AUDIT_VERSION = 1
export const ROTATE_BYTES = 50 * 1024 * 1024
const DAY_MS = 86_400_000

export type AuditDecision = 'allow' | 'ask' | 'deny' | 'approved' | 'refused' | 'pause'
export type AuditBy = 'rule' | 'app' | 'person' | 'default'
export type AuditKind = 'tool' | 'receipt' | 'checkpoint' | 'cap'

export type AuditRow = {
  v: typeof AUDIT_VERSION
  at: number
  panel: string
  project: string
  turn: number
  tool: string
  args: string
  decision: AuditDecision
  by: AuditBy
  rule?: string
  costUsd?: number
  kind: AuditKind
  files?: { path: string; change: 'A' | 'M' | 'D' }[]
}

export type AuditInput = Omit<AuditRow, 'v' | 'args'> & { args: string; known?: { name: string; value: string }[] }

/** One row ready to append: arguments redacted and capped, the schema version set. Pure: `at` is passed in. */
export function buildRow(input: AuditInput): AuditRow {
  const { known, args, ...rest } = input
  const row: AuditRow = { ...rest, v: AUDIT_VERSION, args: redactArgs(args, known) }
  if (row.rule === undefined) delete row.rule
  if (row.costUsd === undefined) delete row.costUsd
  if (row.files === undefined) delete row.files
  return row
}

/** The local calendar day of an epoch-ms time, as YYYY-MM-DD. */
export function dayOf(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * The file a day's rows go to, given the size of that day's first file: the plain name while it is at
 * most 50 MB, and the `.2` name once it is over.
 */
export function fileFor(date: Date | string, size: number): string {
  const day = typeof date === 'string' ? date : dayOf(date.getTime())
  return size > ROTATE_BYTES ? `${day}.2.jsonl` : `${day}.jsonl`
}

const FILE = /^(\d{4})-(\d{2})-(\d{2})(?:\.\d+)?\.jsonl$/

/**
 * The file names older than `days` calendar days before `now`. A file dated today or within the retention is
 * kept; names that are not audit files are ignored.
 */
export function expired(files: string[], now: number, days: number): string[] {
  const [ny, nm, nd] = dayOf(now).split('-').map(Number) as [number, number, number]
  const today = Date.UTC(ny, nm - 1, nd)
  return files.filter((f) => {
    const m = FILE.exec(f)
    if (!m) return false
    const age = (today - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) / DAY_MS
    return age > days
  })
}
