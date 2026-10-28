// stm eval: the project's saved cases run on several models and effort levels, to find the cheapest setting
// that still passes. Cases use the persona eval format (prompt | must: a, b | not: c), kept in the project.

import { parseCases, type EvalCase } from './evals.js'
import { MAIN_MODELS, effortsOf, modelById, modelLabel, type Effort } from './models.js'

export const CASES_FILE = '.supertokenman/evals.txt'

export type Combo = { model: string; effort: Effort | null }
export type Run = { combo: Combo; id: string; pass: boolean; costUsd: number; ms: number; missing: string[]; forbidden: string[] }
export type Row = { combo: Combo; passed: number; total: number; costUsd: number; ms: number }

/** Every model with every asked effort it takes; no effort asked means each model's default. */
export function combos(models: string[] | undefined, efforts: Effort[] | undefined): Combo[] {
  const ids = models?.length ? models : MAIN_MODELS.map((m) => m.id)
  const out: Combo[] = []
  for (const id of ids) {
    if (!modelById(id)) throw new Error(`Unknown model "${id}". Known: ${MAIN_MODELS.map((m) => m.id).join(', ')} and more in the model menu.`)
    const takes = effortsOf(id)
    if (!takes.length) {
      out.push({ model: id, effort: null })
      continue
    }
    const want = efforts?.length ? efforts.filter((e) => takes.includes(e)) : [modelById(id)!.defaultEffort ?? takes[0]!]
    for (const e of want) out.push({ model: id, effort: e })
  }
  return out
}

export const comboLabel = (c: Combo) => `${modelLabel(c.model)}${c.effort ? ` ${c.effort}` : ''}`

export function readCases(text: string): EvalCase[] {
  const cases = parseCases(text)
  if (!cases.length) throw new Error(`No cases yet. Add one per line to ${CASES_FILE}, like:  Summarize README.md | must: install | not: lorem`)
  return cases
}

export function rows(runs: Run[], all: Combo[]): Row[] {
  return all.map((combo) => {
    const mine = runs.filter((r) => r.combo.model === combo.model && r.combo.effort === combo.effort)
    return { combo, passed: mine.filter((r) => r.pass).length, total: mine.length, costUsd: mine.reduce((a, r) => a + r.costUsd, 0), ms: mine.reduce((a, r) => a + r.ms, 0) }
  })
}

/** The cheapest setting that passed every case it ran, among those that ran them all. */
export function cheapest(rs: Row[], cases: number): Row | null {
  return rs.filter((r) => r.total === cases && r.passed === cases).sort((a, b) => a.costUsd - b.costUsd)[0] ?? null
}

export function table(rs: Row[], cases: number, stopped: string | null): string {
  const pad = (s: string, n: number) => s.padEnd(n)
  const lines = [`${pad('Setting', 22)} ${pad('Passed', 8)} ${pad('Cost', 10)} Time`]
  for (const r of rs) lines.push(`${pad(comboLabel(r.combo), 22)} ${pad(r.total ? `${r.passed}/${r.total}` : '-', 8)} ${pad(r.total ? `$${r.costUsd.toFixed(4)}` : '-', 10)} ${r.total ? `${(r.ms / 1000).toFixed(1)} s` : '-'}`)
  const best = cheapest(rs, cases)
  lines.push('', best ? `Cheapest that passed all ${cases}: ${comboLabel(best.combo)} at $${best.costUsd.toFixed(4)}.` : 'No setting passed every case.')
  if (stopped) lines.push(stopped)
  lines.push('Costs are what Claude Code reported for these runs. One run per case: a pass is not proof it always passes.')
  return lines.join('\n')
}
