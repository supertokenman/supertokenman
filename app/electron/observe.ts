// Observability in the main process: scores per turn, datasets built from real turns, experiments that
// run a dataset against a persona's production and staging instructions, and the OTLP export to your own
// Langfuse (off by default, prompts only when asked). Files live in userData.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { evalPrompt, grade } from '../shared/evals.js'
import { rougeL } from '../shared/rouge.js'
import { compare, scoresOf, toOtlp, type Dataset, type RunResult, type Score, type TurnForExport } from '../shared/spans.js'
import type { TraceTurn } from '../shared/trace.js'

export type Otel = { on: boolean; endpoint: string; withText: boolean }
export type Staging = { instructions: string; note?: string; at: number }
export type Variant = { name: string; personaId: string; use: 'production' | 'staging' }

type Deps = {
  dir: () => string
  turns: () => (TraceTurn & { sid: string })[]
  persona: (id: string) => { id: string; name: string; instructions: string } | undefined
  promote: (id: string, instructions: string, note: string) => void
  ask: (prompt: string) => Promise<{ text: string; costUsd: number }>
  budget: (tokens: number) => string | null
  secret: (name: string) => string | undefined
}

const readJson = <T>(f: string, d: T): T => {
  try {
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : d
  } catch {
    return d
  }
}

export function observe(d: Deps) {
  const f = (n: string) => join(d.dir(), n)
  const scores = (): Score[] => {
    try {
      return readFileSync(f('scores.jsonl'), 'utf8').split('\n').filter(Boolean).slice(-5000).map((l) => JSON.parse(l) as Score)
    } catch {
      return []
    }
  }
  const datasets = () => readJson<Dataset[]>(f('datasets.json'), [])
  const staging = () => readJson<Record<string, Staging>>(f('staging.json'), {})
  const otel = () => readJson<Otel>(f('otel.json'), { on: false, endpoint: '', withText: false })

  const forExport = (t: TraceTurn): TurnForExport => ({ id: t.id ?? `t${t.at}`, at: t.at, ms: t.ms, prompt: t.prompt, persona: t.persona, model: t.model, costUsd: t.costUsd, inputTokens: t.inputTokens, outputTokens: t.outputTokens, isError: t.isError, spans: t.spans ?? [], scores: Object.values(scoresOf(scores(), t.id ?? '')) })

  async function exportTurns(turns: TraceTurn[]): Promise<{ ok: boolean; status?: number; error?: string }> {
    const o = otel()
    if (!o.endpoint) return { ok: false, error: 'No endpoint.' }
    const pub = d.secret('LANGFUSE_PUBLIC_KEY')
    const sec = d.secret('LANGFUSE_SECRET_KEY')
    try {
      const r = await fetch(o.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(pub && sec ? { authorization: `Basic ${Buffer.from(`${pub}:${sec}`).toString('base64')}` } : {}) }, body: JSON.stringify(toOtlp(turns.map(forExport), o.withText)) })
      return { ok: r.ok, status: r.status }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  return {
    scores,
    turns: () => {
      const all = scores()
      return d.turns().map((t) => ({ ...t, scores: scoresOf(all, t.id ?? '') }))
    },
    score(turn: string, name: string, value: number, note?: string) {
      const s: Score = { turn: String(turn), name: String(name).slice(0, 40) || 'you', value: Math.max(0, Math.min(1, Number(value) || 0)), at: Date.now(), by: 'you', ...(note?.trim() ? { note: note.trim().slice(0, 300) } : {}) }
      appendFileSync(f('scores.jsonl'), `${JSON.stringify(s)}\n`)
      return s
    },
    datasets,
    saveDataset(ds: Dataset) {
      const clean: Dataset = { id: ds.id || `ds${Date.now()}`, name: String(ds.name || 'Dataset').slice(0, 80), at: Date.now(), cases: (ds.cases ?? []).filter((c) => c.prompt?.trim()).map((c, i) => ({ id: c.id || `c${i + 1}`, prompt: c.prompt.slice(0, 4000), ...(c.expected?.trim() ? { expected: c.expected.slice(0, 4000) } : {}), ...(c.persona ? { persona: c.persona } : {}), ...(c.from ? { from: c.from } : {}) })) }
      const list = datasets().filter((x) => x.id !== clean.id)
      writeFileSync(f('datasets.json'), JSON.stringify([clean, ...list], null, 1))
      return datasets()
    },
    deleteDataset(id: string) {
      writeFileSync(f('datasets.json'), JSON.stringify(datasets().filter((x) => x.id !== id), null, 1))
      return datasets()
    },
    staging,
    setStaging(personaId: string, s: Staging | null) {
      const all = staging()
      if (s?.instructions?.trim()) all[personaId] = { instructions: s.instructions, note: s.note?.slice(0, 200), at: Date.now() }
      else delete all[personaId]
      writeFileSync(f('staging.json'), JSON.stringify(all, null, 1))
      return all
    },
    promote(personaId: string) {
      const s = staging()[personaId]
      if (!s) throw new Error('This persona has no staging version.')
      d.promote(personaId, s.instructions, s.note || 'Promoted from staging')
      const all = staging()
      delete all[personaId]
      writeFileSync(f('staging.json'), JSON.stringify(all, null, 1))
      return all
    },
    /** Runs every case once per variant, one at a time, stopping a variant's case when the budget says no. */
    async run(datasetId: string, variants: Variant[], must: string[], stop?: AbortSignal) {
      const ds = datasets().find((x) => x.id === datasetId)
      if (!ds) throw new Error('No such dataset.')
      const results: RunResult[] = []
      for (const v of variants.slice(0, 4)) {
        const p = d.persona(v.personaId)
        const instructions = v.use === 'staging' ? staging()[v.personaId]?.instructions : p?.instructions
        for (const c of ds.cases) {
          if (stop?.aborted) break
          const base = { caseId: c.id, variant: v.name }
          if (instructions == null) {
            results.push({ ...base, answer: '', costUsd: 0, ms: 0, checks: 0, passed: 0, error: v.use === 'staging' ? 'No staging version.' : 'No such persona.' })
            continue
          }
          const prompt = evalPrompt(instructions, c.prompt)
          const no = d.budget(Math.ceil(prompt.length / 3.6))
          if (no) {
            results.push({ ...base, answer: '', costUsd: 0, ms: 0, checks: 0, passed: 0, error: no })
            continue
          }
          const t0 = Date.now()
          try {
            const r = await d.ask(prompt)
            const g = grade({ id: c.id, prompt: c.prompt, must, mustNot: [] }, r.text, 'claude')
            results.push({ ...base, answer: r.text.slice(0, 4000), costUsd: r.costUsd, ms: Date.now() - t0, checks: must.length, passed: must.length - g.missing.length, ...(c.expected ? { rouge: rougeL(r.text, c.expected).f } : {}) })
          } catch (e) {
            results.push({ ...base, answer: '', costUsd: 0, ms: Date.now() - t0, checks: 0, passed: 0, error: (e as Error).message })
          }
        }
      }
      const out = { at: Date.now(), datasetId, variants, results, summary: compare(results) }
      appendFileSync(f('experiments.jsonl'), `${JSON.stringify(out)}\n`)
      return out
    },
    experiments: () => {
      try {
        return readFileSync(f('experiments.jsonl'), 'utf8').split('\n').filter(Boolean).slice(-20).map((l) => JSON.parse(l)).reverse()
      } catch {
        return []
      }
    },
    otel,
    setOtel(o: Otel) {
      const clean: Otel = { on: Boolean(o.on), endpoint: String(o.endpoint ?? '').trim(), withText: Boolean(o.withText) }
      if (clean.endpoint && !/^https?:\/\//.test(clean.endpoint)) throw new Error('The endpoint must start with http:// or https://.')
      writeFileSync(f('otel.json'), JSON.stringify(clean, null, 1))
      return clean
    },
    exportTurns,
    /** After each turn, when export is on. Never throws: a down collector does not touch the panel. */
    afterTurn(t: TraceTurn) {
      if (otel().on) void exportTurns([t])
    },
  }
}
