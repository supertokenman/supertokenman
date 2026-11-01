import { useEffect, useRef, useState } from 'react'
import { MAIN_MODELS } from '../../shared/models'
import { clean } from '../errors'
import '../bridge'
import { NumberField, Select } from '../ui'
import type { EvalResult, PackEntry } from './api'
import { duration, money, pctText } from './logic'

export type Opened = { sid: string; cwd: string; branch: string; base: string; repo: string }

/** The eval of one pack: the same task twice in two worktrees of the project, one with the pack, then a side-by-side. */
export function PackEvalSetup(props: { entry: PackEntry; root: string; onStarted: (evalId: string, opened: { with: Opened; without: Opened }, model: string) => void; onCancel: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(MAIN_MODELS.find((m) => m.family === 'sonnet')?.id ?? MAIN_MODELS[0]!.id)
  const [turns, setTurns] = useState(30)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const start = () => {
    setBusy(true)
    setErr('')
    window.stm.packs.evalStart(props.entry.id, props.root, prompt.trim(), model, turns).then(
      (r) => props.onStarted(r.evalId, r.opened, model),
      (e) => (setErr(clean(e)), setBusy(false)),
    )
  }
  const bad = !prompt.trim() ? 'Write the task first.' : turns < 1 || turns > 200 ? 'Turn cap is 1 to 200.' : ''
  return (
    <div className="pk-review">
      <div className="ob-head">
        <div className="ob-prompt">Eval {props.entry.name}</div>
        <div className="faint">Runs the same task twice, each in its own copy of the project: once with the pack, once without. It needs a git repository.</div>
      </div>
      <div className="mn-form">
        <label className="wide">Task<textarea rows={5} value={prompt} placeholder="Describe a task you do in this project" onChange={(e) => setPrompt(e.target.value)} /></label>
        <label>Model<Select value={model} onChange={(e) => setModel(e.target.value)}>{MAIN_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></label>
        <label>Turn cap<NumberField min={1} max={200} value={turns} onChange={(e) => setTurns(Number(e.target.value))} /></label>
      </div>
      <p className="faint">This is two full runs, so it costs about twice one run. Nothing starts until you press Start.</p>
      {err && <div className="notice error" role="alert">{err}</div>}
      <div className="ob-row pk-actions">
        <span className="pk-grow faint" role="status">{bad}</span>
        <button className="ghost" onClick={props.onCancel}>Cancel</button>
        <button className="primary" disabled={!!bad || busy} onClick={start}>{busy ? 'Starting…' : 'Start both runs'}</button>
      </div>
    </div>
  )
}

type Side = EvalResult['withPack']
const outcome = (s: Side) => (!s.ok ? 'Failed' : s.capped ? 'Hit the turn cap' : s.busy ? 'Running' : s.tests ? (s.tests.ok ? `Tests pass (${s.tests.passed})` : `Tests fail (${s.tests.failed})`) : s.files ? 'Changed files' : 'No changes')
export const rowsOf = (r: EvalResult) => {
  const d = r.comparison.deltas
  const w = r.withPack
  const o = r.without
  return [
    { k: 'Result', a: outcome(w), b: outcome(o), d: '' },
    { k: 'Turns', a: String(w.turns), b: String(o.turns), d: pctText(d.turns) },
    { k: 'Tokens', a: w.tokens.toLocaleString(), b: o.tokens.toLocaleString(), d: pctText(d.tokens) },
    { k: 'Cost', a: money(w.costUsd), b: money(o.costUsd), d: pctText(d.costUsd) },
    { k: 'Time', a: duration(w.ms), b: duration(o.ms), d: pctText(d.ms) },
    { k: 'Diff', a: `${w.files} files, +${w.added} -${w.removed}`, b: `${o.files} files, +${o.added} -${o.removed}`, d: '' },
  ]
}

/** The side-by-side. Polls until both runs are done; the two panels are in the window meanwhile. */
export function PackEvalResult(props: { evalId: string; entry: PackEntry; installed: boolean; onFinish: (what: 'keep' | 'remove' | 'discard') => Promise<void>; initial?: EvalResult }) {
  const [r, setR] = useState<EvalResult | null>(props.initial ?? null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const stop = useRef(false)
  useEffect(() => {
    stop.current = false
    let t: ReturnType<typeof setTimeout>
    const tick = () =>
      window.stm.packs.evalResult(props.evalId).then(
        (x) => {
          if (stop.current) return
          setR(x)
          if (!x.finished) t = setTimeout(tick, 2500)
        },
        (e) => !stop.current && setErr(clean(e)),
      )
    void tick()
    return () => {
      stop.current = true
      clearTimeout(t)
    }
  }, [props.evalId])
  const finish = (what: 'keep' | 'remove' | 'discard') => {
    setBusy(true)
    props.onFinish(what).catch((e) => (setErr(clean(e)), setBusy(false)))
  }
  return (
    <div className="pk-review">
      <div className="ob-head">
        <div className="ob-prompt">Eval {props.entry.name}: with the pack against without</div>
        <div className="faint" role="status">{r ? (r.finished ? 'Both runs are done.' : 'Running. The two panels are open in the window; you can watch them.') : 'Starting…'}</div>
      </div>
      {err && <div className="notice error" role="alert">{err}</div>}
      {r && (
        <>
          <table className="pk-table">
            <caption className="sr-only">Comparison of the two runs</caption>
            <thead><tr><th scope="col"><span className="sr-only">Measure</span></th><th scope="col">With pack</th><th scope="col">Without pack</th><th scope="col">Difference</th></tr></thead>
            <tbody>
              {rowsOf(r).map((x) => (
                <tr key={x.k}><th scope="row">{x.k}</th><td>{x.a}</td><td>{x.b}</td><td className="faint">{x.d}</td></tr>
              ))}
            </tbody>
          </table>
          <div className={`pk-verdict ${r.finished && r.comparison.comparable ? '' : 'wait'}`}><b>{r.finished ? r.comparison.verdict : 'No verdict until both runs finish.'}</b><span className="faint">{r.comparison.note}</span></div>
          {r.errors.map((e) => <p key={e} className="pk-warn">{e}</p>)}
        </>
      )}
      <div className="ob-row pk-actions">
        <span className="pk-grow faint">Each choice drops both copies of the project and closes the two panels.</span>
        <button className="ghost" disabled={busy} onClick={() => finish('discard')}>Discard worktrees</button>
        {props.installed && <button className="ghost" disabled={busy || !r?.finished} onClick={() => finish('remove')}>Remove pack</button>}
        <button className="primary" disabled={busy || !r?.finished} onClick={() => finish('keep')}>{props.installed ? 'Keep pack' : 'Keep pack and install'}</button>
      </div>
    </div>
  )
}
