import { useEffect, useState } from 'react'
import { EmptyState } from './EmptyState'
import { IconCheck, IconClose, IconMerge, IconTest } from './icons'
import { rank, whyFirst, type Attempt, type TestRun } from '../shared/fanout'
import type { State } from './state'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'
import { Select } from './ui'

const close = (
  <IconClose />
)
const secs = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`)
const short = (m: string) => m.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2') || 'default'

/** The groups of attempts open now, newest first: what the board can show. */
export function groupsOf(byId: Record<string, State | undefined>): { group: string; prompt: string; sids: string[] }[] {
  const g = new Map<string, string[]>()
  for (const [sid, s] of Object.entries(byId)) if (s?.worktree?.group) g.set(s.worktree.group, [...(g.get(s.worktree.group) ?? []), sid])
  return [...g]
    .map(([group, sids]) => ({ group, sids, prompt: (byId[sids[0]!]?.lines.find((l) => l.kind === 'user') as { text?: string } | undefined)?.text ?? '' }))
    .sort((a, b) => b.group.localeCompare(a.group))
}

/**
 * The scoreboard of a fan-out: each attempt's tests, diff, cost and time side by side, ranked. The board
 * names a leader and why; keeping one is a click and a confirm, and the other attempts are dropped.
 */
export function FanoutSheet(props: { byId: Record<string, State | undefined>; group?: string; money: (usd: number) => string; onFocus: (sid: string) => void; onClose: () => void }) {
  const groups = groupsOf(props.byId)
  const [group, setGroup] = useState(props.group ?? groups[0]?.group ?? '')
  const cur = groups.find((g) => g.group === group) ?? groups[0]
  const [stats, setStats] = useState<Record<string, { files: number; added: number; removed: number }>>({})
  const [tests, setTests] = useState<Record<string, TestRun | 'running' | { error: string }>>({})
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [now, setNow] = useState(Date.now())
  const sids = cur?.sids ?? []
  const idle = sids.map((s) => props.byId[s]?.busy).join()
  // diffs read again whenever an attempt finishes a turn
  useEffect(() => {
    for (const sid of sids) void window.stm.worktree.stat(sid).then((st) => st && setStats((o) => ({ ...o, [sid]: st })))
  }, [group, idle])
  // the clock only moves a running attempt's time: still while none runs or the window is hidden
  const anyBusy = sids.some((s) => props.byId[s]?.busy)
  useEffect(() => {
    setNow(Date.now())
    if (!anyBusy) return
    const t = setInterval(() => !document.hidden && setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [anyBusy])
  const start = cur ? parseInt(cur.group.slice(1), 36) : 0
  const rows: Attempt[] = sids.map((sid) => {
    const s = props.byId[sid]!
    const t = tests[sid]
    return { sid, attempt: s.worktree?.attempt ?? 0, model: s.model, busy: s.busy, costUsd: s.costUsd, ms: Math.max(0, (s.busy ? now : s.lastTurnAt ?? now) - start), files: stats[sid]?.files ?? 0, added: stats[sid]?.added ?? 0, removed: stats[sid]?.removed ?? 0, tests: t && typeof t === 'object' && 'cmd' in t ? t : null }
  })
  const ranked = rank(rows)
  const why = whyFirst(rows)
  const runTests = (sid: string) => (setTests((o) => ({ ...o, [sid]: 'running' })), void window.stm.worktree.test(sid).then((r) => setTests((o) => ({ ...o, [sid]: r })), (e) => setTests((o) => ({ ...o, [sid]: { error: clean(e) } }))))
  const keep = async (sid: string) => {
    setBusy(true)
    setMsg('')
    try {
      const a = rows.find((r) => r.sid === sid)!
      const r = await window.stm.worktree.keep(sid, `Attempt ${a.attempt} of ${rows.length} (${short(a.model)}), kept from the scoreboard`)
      if (!r.merged) setMsg(r.why ?? 'Not merged.')
      else {
        window.dispatchEvent(new CustomEvent('stm:close-panels', { detail: { sids: [sid, ...r.closed], note: `Kept attempt ${a.attempt}: merged, the other attempts dropped.`, repo: props.byId[sid]?.worktree?.repo } }))
        props.onClose()
      }
    } catch (e) {
      setMsg(clean(e))
    }
    setBusy(false)
    setConfirm(null)
  }
  const most = Math.max(1, ...rows.map((r) => r.added + r.removed))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet config observe fo ${cur ? '' : 'fit'}`} role="dialog" aria-label="Fan-out scoreboard">
        <header className="sheet-head">
          <div className="sheet-title">Scoreboard</div>
          {groups.length > 1 && <Select value={cur?.group} onChange={(e) => setGroup(e.target.value)} aria-label="Fan-out">{groups.map((g) => <option key={g.group} value={g.group}>{g.prompt.slice(0, 50) || g.group}</option>)}</Select>}
          <span className="spacer-flex" />
          {cur && <button className="small" disabled={rows.some((r) => r.busy) || Object.values(tests).includes('running')} onClick={() => rows.forEach((r) => runTests(r.sid))}><IconTest />Run all tests</button>}
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        <div className="dsg-body">
          {!cur ? (
            <EmptyState title="No attempts open" text="Start one with Try several ways: the same prompt in two or three worktree panels, each with its own model." />
          ) : (
            <>
              <div className="fo-prompt"><span className="fld-label">Prompt</span><div>{cur.prompt}</div></div>
              <div className="fo-why">{why ? <><b>Leading: attempt {ranked[0]!.attempt}.</b> {why}</> : <span className="faint">No leader yet: {rows.some((r) => r.busy) ? 'attempts are still working.' : 'no attempt changed any file.'}</span>}</div>
              <div className="fo-table" role="table">
                <div className="fo-row fo-headrow" role="row">
                  {['#', 'Model', 'Tests', 'Diff', 'Cost', 'Time', ''].map((h) => <span key={h} role="columnheader">{h}</span>)}
                </div>
                {ranked.map((r, i) => {
                  const t = tests[r.sid]
                  return (
                    <div key={r.sid} role="row" className={`fo-row ${i === 0 && why ? 'lead' : ''}`}>
                      <span className="fo-n">{r.attempt}</span>
                      <span className="fo-model">{r.busy ? <StateMark state="busy" label="Working" /> : <StateMark state="up" label="Done" />}<button className="link" onClick={() => props.onFocus(r.sid)}>{short(r.model)}</button></span>
                      <span className="fo-tests">
                        {t === 'running' ? <span className="faint"><StateMark state="busy" label="Running" /> running</span>
                          : t && 'error' in t ? <span className="pm-err" data-tip={t.error}>no run</span>
                          : t ? <span className={t.ok ? 'fo-pass' : 'fo-fail'} data-tip={`${t.cmd} · ${secs(t.ms)}\n\n${t.tail}`}>{t.ok ? <IconCheck /> : null}{t.ok ? 'pass' : 'fail'} · {t.passed}/{t.passed + t.failed}</span>
                          : <button className="ghost small" disabled={r.busy || !r.files} onClick={() => runTests(r.sid)}><IconTest />Run</button>}
                      </span>
                      <span className="fo-diff">
                        {r.files ? <><span className="mh-bar"><i style={{ width: `${((r.added + r.removed) / most) * 100}%` }} /></span><span>{r.files} {r.files === 1 ? 'file' : 'files'} <span className="wt-add">+{r.added}</span> <span className="wt-del">−{r.removed}</span></span></> : <span className="faint">no changes</span>}
                      </span>
                      <span className="fo-num">{props.money(r.costUsd)}</span>
                      <span className="fo-num">{secs(r.ms)}</span>
                      <span className="fo-act">
                        {confirm === r.sid ? (
                          <>
                            <button className="ghost small" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
                            <button className="primary small" disabled={busy} onClick={() => void keep(r.sid)}>{busy ? 'Merging…' : 'Merge it'}</button>
                          </>
                        ) : (
                          <button className={i === 0 && why ? 'primary small' : 'small'} disabled={r.busy || !r.files || busy} onClick={() => setConfirm(r.sid)}><IconMerge />Keep</button>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
              {Object.entries(tests).map(([sid, t]) => t && typeof t === 'object' && 'error' in t ? <div key={sid} className="notice error">Attempt {props.byId[sid]?.worktree?.attempt}: {t.error}</div> : null)}
              {confirm && <div className="notice">Merging attempt {props.byId[confirm]?.worktree?.attempt} into {props.byId[confirm]?.worktree?.base} drops the other {rows.length - 1} attempts, their branches and their panels.</div>}
              {msg && <div className="notice error">{msg}</div>}
              <div className="faint">Order: finished first, then passing tests, fewer failures, a smaller diff, lower cost, less time. Tests run in each attempt's worktree only when you click.</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
