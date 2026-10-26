// The sandbox for message filters: each run is a fresh worker thread with a vm context that has only
// the language built-ins (no require, process, fetch, timers or files), a CPU time limit and a small heap.
// The worker is terminated if it does not answer in time.
import { Worker } from 'node:worker_threads'

const WORKER = `
const { parentPort, workerData } = require('node:worker_threads')
const vm = require('node:vm')
const { code, stage, text, valves } = workerData
try {
  const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } })
  vm.runInContext(code, ctx, { timeout: 200 })
  const fn = vm.runInContext('typeof ' + stage + ' === "function" ? ' + stage + ' : null', ctx, { timeout: 50 })
  if (!fn) parentPort.postMessage({ ok: false, error: 'No ' + stage + ' function.' })
  else {
    ctx.__t = String(text); ctx.__v = JSON.parse(JSON.stringify(valves || {}))
    const out = vm.runInContext(stage + '(__t, __v)', ctx, { timeout: 300 })
    parentPort.postMessage(typeof out === 'string' ? { ok: true, text: out } : { ok: false, error: stage + ' did not return text.' })
  }
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e && e.message || e).slice(0, 300) })
}
`

export type BoxResult = { ok: true; text: string } | { ok: false; error: string }

export function runFilter(code: string, stage: 'inlet' | 'outlet', text: string, valves: Record<string, unknown>, wallMs = 1500): Promise<BoxResult> {
  return new Promise((resolve) => {
    let done = false
    const w = new Worker(WORKER, { eval: true, workerData: { code, stage, text, valves }, resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 }, env: {} })
    const finish = (r: BoxResult) => {
      if (done) return
      done = true
      clearTimeout(t)
      void w.terminate()
      resolve(r)
    }
    const t = setTimeout(() => finish({ ok: false, error: 'Took too long.' }), wallMs)
    w.once('message', (m: BoxResult) => finish(m))
    w.once('error', (e) => finish({ ok: false, error: e.message.slice(0, 300) }))
    w.once('exit', () => finish({ ok: false, error: 'The filter stopped.' }))
  })
}

/** Text through the filters in order; a filter that fails or answers oddly is skipped and named. */
export async function throughFilters(text: string, list: { name: string; code: string; valves: Record<string, unknown> }[], stage: 'inlet' | 'outlet', accept: (before: string, after: unknown) => boolean) {
  let out = text
  const skipped: { name: string; error: string }[] = []
  const ran: string[] = []
  for (const f of list) {
    const r = await runFilter(f.code, stage, out, f.valves)
    if (r.ok && accept(out, r.text)) {
      out = r.text
      ran.push(f.name)
    } else skipped.push({ name: f.name, error: r.ok ? 'Answer too large.' : r.error })
  }
  return { text: out, ran, skipped }
}
