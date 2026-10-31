// Pure helpers of the Packs screens: states of a row, the diff shown for a conflict, which decisions are
// still open, and the numbers of the eval comparison. No React, no ipc.
import type { Delta } from '../../shared/packeval'

export type Row = { id: string; version: string; versions: string[]; valid: boolean }
export type Inst = { packId: string; version: string; previous: string | null; scope: 'project' | 'global' }

const num = (v: string) => v.split('-')[0]!.split('.').map(Number)
export function newer(a: string, b: string): boolean {
  const [x, y] = [num(a), num(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

/** One line for the list: not installed, installed at a version, or installed with a newer version in the catalog. */
export function installLabel(row: Row, installs: Inst[]): { text: string; update: string | null } {
  const mine = installs.filter((i) => i.packId === row.id)
  if (!mine.length) return { text: 'Not installed', update: null }
  const i = mine.find((x) => x.scope === 'project') ?? mine[0]!
  const where = mine.length > 1 ? 'here and global' : i.scope === 'global' ? 'global' : 'this project'
  const update = newer(row.version, i.version) ? row.version : null
  return { text: `Installed ${i.version}, ${where}`, update }
}

export type Side = 'mine' | 'theirs' | 'beside'
export type UpdateView = { conflicts: { path: string }[]; asks: string[]; newHosts: string[] }

/** The files that still need an answer before Update can be allowed. */
export function openUpdate(v: UpdateView, decisions: Record<string, string>): string[] {
  return [...v.conflicts.map((c) => c.path), ...v.asks].filter((p) => !decisions[p])
}

/** What each choice sends to packs:update. Keep mine leaves the file as it is (nothing is written). */
export function toUpdateDecisions(picks: Record<string, string>, asks: string[]): Record<string, 'mine' | 'theirs' | 'beside' | 'recreate' | 'leave'> {
  const out: Record<string, 'mine' | 'theirs' | 'beside' | 'recreate' | 'leave'> = {}
  for (const [k, v] of Object.entries(picks)) {
    if (asks.includes(k)) out[k] = v === 'recreate' ? 'recreate' : 'leave'
    else out[k] = v === 'theirs' ? 'theirs' : v === 'beside' ? 'beside' : 'mine'
  }
  return out
}

export type ReviewPlan = { errors: string[]; conflicts: { to: string; overwritable: boolean }[]; blocked: boolean }
/** Allow is off while a validation error shows or a conflict has no answer. */
export function canAllow(plan: ReviewPlan, decisions: Record<string, string>): { ok: boolean; why: string } {
  if (plan.errors.length) return { ok: false, why: plan.errors[0]! }
  const open = plan.conflicts.filter((c) => !decisions[c.to])
  if (open.length) return { ok: false, why: `Choose skip or overwrite for ${open[0]!.to}.` }
  return { ok: true, why: '' }
}

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string }
/** Line diff (longest common subsequence), capped so a huge file cannot freeze the window. */
export function lineDiff(mine: string, theirs: string, cap = 400): DiffLine[] {
  const a = mine.split('\n').slice(0, cap)
  const b = theirs.split('\n').slice(0, cap)
  const t: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i]![j] = a[i] === b[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!)
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) (out.push({ kind: 'same', text: a[i]! }), i++, j++)
    else if (t[i + 1]![j]! >= t[i]![j + 1]!) out.push({ kind: 'del', text: a[i++]! })
    else out.push({ kind: 'add', text: b[j++]! })
  }
  while (i < a.length) out.push({ kind: 'del', text: a[i++]! })
  while (j < b.length) out.push({ kind: 'add', text: b[j++]! })
  return out
}

/** The host of an https address, for the line shown before Fetch; null when it is not one. */
export function gitHost(url: string): string | null {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname ? u.hostname : null
  } catch {
    return null
  }
}

export const money = (usd: number) => (usd < 0.01 && usd > 0 ? '< $0.01' : `$${usd.toFixed(2)}`)
export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}
/** "+12%", "-30%", "same" for a delta; "n/a" when the base was zero. */
export function pctText(d: Delta): string {
  if (d.pct === null) return d.abs === 0 ? 'same' : 'n/a'
  const r = Math.round(d.pct)
  return r === 0 ? 'same' : `${r > 0 ? '+' : '-'}${Math.abs(r)}%`
}
