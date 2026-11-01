// Pure helpers of the Control screens (rules editor, audit table, plan strip). No DOM, so they can be tested.
import type { AuditRow } from './auditlog.js'
import type { Plan } from './planview.js'

export const ROW_H = 30
export const FILE_H = 22

/** The height of one audit row; a receipt row that is open adds a line per changed file. */
export function rowHeight(r: Pick<AuditRow, 'kind' | 'files'>, open: boolean): number {
  return open && r.kind === 'receipt' && r.files?.length ? ROW_H + FILE_H * r.files.length + 8 : ROW_H
}

/** Which rows to draw for a scroll position: the slice and the spacer heights above and below it. */
export function visibleRange(heights: number[], top: number, view: number, over = 6): { start: number; end: number; before: number; after: number } {
  let y = 0
  let start = 0
  while (start < heights.length && y + heights[start]! <= top) y += heights[start++]!
  let end = start
  let yEnd = y
  while (end < heights.length && yEnd < top + view) yEnd += heights[end++]!
  const s = Math.max(0, start - over)
  const e = Math.min(heights.length, end + over)
  let before = 0
  for (let i = 0; i < s; i++) before += heights[i]!
  let after = 0
  for (let i = e; i < heights.length; i++) after += heights[i]!
  return { start: s, end: e, before, after }
}

/** The local-time bounds of a day named `YYYY-MM-DD`, as the audit query takes them. */
export function dayRange(day: string): { from: number; to: number } {
  const [y, m, d] = day.split('-').map(Number)
  const from = new Date(y!, m! - 1, d!, 0, 0, 0, 0).getTime()
  return { from, to: new Date(y!, m! - 1, d! + 1, 0, 0, 0, 0).getTime() - 1 }
}

const READ = new Set(['read', 'Read', 'Grep', 'Glob', 'NotebookRead', 'write', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

/** The tool input of the "test a call" box: the one field the person types goes where the tool keeps it. */
export function testInput(tool: string, value: string): Record<string, unknown> {
  const v = value.trim()
  if (tool === 'WebFetch' || tool === 'network') return /^https?:\/\//i.test(v) || tool === 'WebFetch' ? { url: v } : { command: v }
  if (tool === 'WebSearch') return { query: v }
  if (READ.has(tool)) return { file_path: v }
  return { command: v }
}

export type PlanSummary = { done: number; total: number; current?: string }
/** Progress of a plan for the strip and the canvas badge: items done of all, and the item in progress. */
export function planSummary(p: Pick<Plan, 'items'> | null | undefined): PlanSummary {
  const items = p?.items ?? []
  const cur = items.find((i) => i.status === 'in_progress')
  return { done: items.filter((i) => i.status === 'completed').length, total: items.length, ...(cur ? { current: cur.active || cur.text } : {}) }
}

/** A breakpoint list as the card edits it: tool globs for `before`, and whether `after plan` is on. */
export type Bp = { kind: 'before' | 'afterPlan'; tool?: string }
export function withBefore(list: Bp[], tool: string): Bp[] {
  const t = tool.trim()
  return !t || list.some((b) => b.kind === 'before' && b.tool === t) || list.length >= 20 ? list : [...list, { kind: 'before', tool: t }]
}
export function setAfterPlan(list: Bp[], on: boolean): Bp[] {
  const rest = list.filter((b) => b.kind !== 'afterPlan')
  return on ? [...rest, { kind: 'afterPlan' }] : rest
}
