import { effortsOf, MAIN_MODELS, MORE_MODELS, modelById, type Effort } from '../shared/models'

export const EFFORT_LABEL: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' }

export type Row = { kind: 'model'; id: string; label: string } | { kind: 'effort' } | { kind: 'more' }

/** The main menu's rows: the main models, then Effort (when the model takes one), then More models. */
export function mainRows(model: string): Row[] {
  const rows: Row[] = [{ kind: 'model', id: '', label: 'Default model' }, ...MAIN_MODELS.map((m) => ({ kind: 'model' as const, id: m.id, label: m.label }))]
  if (effortsOf(model).length) rows.push({ kind: 'effort' })
  if (MORE_MODELS.length) rows.push({ kind: 'more' })
  return rows
}

/** Effort submenu values: '' is the model's default. */
export const effortRows = (model: string): string[] => ['', ...effortsOf(model)]
export const moreRows = (): string[] => MORE_MODELS.map((m) => m.id)

/** The effort actually sent: never one the model does not take. */
export const validEffort = (model: string, effort: string): string => (effortsOf(model).includes(effort as Effort) ? effort : '')

export function triggerLabel(model: string, effort: string): string {
  const name = model ? (modelById(model)?.label ?? model) : 'Default model'
  const e = validEffort(model, effort)
  return e ? `${name} · ${EFFORT_LABEL[e as Effort]}` : name
}

/** Wrapping arrow movement over n rows. */
export const step = (i: number, n: number, d: 1 | -1): number => (n ? (i + d + n) % n : 0)

/** Number shortcut: '1'..'9' picks the nth main model; null when out of range. */
export function shortcut(key: string, rows: Row[]): string | null {
  if (!/^[1-9]$/.test(key)) return null
  const models = rows.filter((r): r is Extract<Row, { kind: 'model' }> => r.kind === 'model')
  return models[Number(key) - 1]?.id ?? null
}
