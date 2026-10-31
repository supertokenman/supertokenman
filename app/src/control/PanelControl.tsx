import { useCallback, useEffect, useState } from 'react'
import './control.css'
import { IconClose } from '../icons'
import { Switch } from '../ui'
import { confirmDialog } from '../ui'
import { clean } from '../errors'
import { setAfterPlan, withBefore, type Bp } from '../../shared/controlview'
import type { CheckpointInfo } from './types'

type Which = 'checkpoints' | 'breakpoints' | null
const stored = (sid: string): Bp[] => {
  try {
    const v = JSON.parse(localStorage.getItem(`stm.bp.${sid}`) ?? '[]') as Bp[]
    return Array.isArray(v) ? v.filter((b) => b && (b.kind === 'afterPlan' || (b.kind === 'before' && typeof b.tool === 'string'))).slice(0, 20) : []
  } catch {
    return []
  }
}
const ago = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/** Two buttons for the panel's More tray: checkpoints (restore to a turn) and breakpoints (hold a tool call for a card). */
export default function PanelControl(props: { sid: string; cwd: string; busy: boolean }) {
  const [which, setWhich] = useState<Which>(null)
  const [count, setCount] = useState(0)
  const [bp, setBp] = useState<Bp[]>(() => stored(props.sid))
  useEffect(() => {
    const off = window.stm.onEvent((sid, e) => (sid === props.sid && (e as { kind?: string }).kind === 'checkpoint' ? setCount((n) => n + 1) : undefined))
    return off
  }, [props.sid])
  const apply = useCallback(
    async (next: Bp[]) => {
      setBp(next)
      try {
        localStorage.setItem(`stm.bp.${props.sid}`, JSON.stringify(next))
      } catch {
        /* storage may be blocked; the list still reaches the app */
      }
      await window.stm.control.breakpointSet(props.sid, next)
    },
    [props.sid],
  )
  return (
    <>
      <button className="ghost small" data-tip="Go back to the files as they were at the end of an earlier turn" onClick={() => setWhich('checkpoints')}>Checkpoints</button>
      <button className="ghost small" data-tip="Hold the next call of a tool, or the first step after the plan, for your approval" onClick={() => setWhich('breakpoints')}>Breakpoints{bp.length ? ` (${bp.length})` : ''}</button>
      {which === 'checkpoints' && <Checkpoints sid={props.sid} cwd={props.cwd} busy={props.busy} bump={count} onClose={() => setWhich(null)} />}
      {which === 'breakpoints' && <Breakpoints list={bp} onChange={apply} onClose={() => setWhich(null)} />}
    </>
  )
}

function Card(props: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet observe ctl-card" role="dialog" aria-label={props.title}>
        <header className="sheet-head">
          <div className="sheet-title">{props.title}</div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="sheet-body ctl-col">
          <p className="ctl-help">{props.sub}</p>
          {props.children}
        </div>
      </div>
    </div>
  )
}

function Checkpoints(props: { sid: string; cwd: string; busy: boolean; bump: number; onClose: () => void }) {
  const [list, setList] = useState<CheckpointInfo[] | null>(null)
  const [err, setErr] = useState('')
  const [working, setWorking] = useState<number | null>(null)
  useEffect(() => {
    window.stm.control.checkpointList(props.sid).then((l) => setList([...l].sort((a, b) => b.turn - a.turn)), (e) => (setErr(clean(e)), setList([])))
  }, [props.sid, props.bump])
  const restore = async (c: CheckpointInfo) => {
    setErr('')
    setWorking(c.turn)
    try {
      const p = await window.stm.control.checkpointPreview(props.sid, c.turn)
      const shown = p.files.slice(0, 12).map((f) => `${f.change} ${f.path}`).join('\n')
      const more = p.files.length > 12 ? `\n… and ${p.files.length - 12} more` : ''
      const ok = await confirmDialog({
        title: `Restore to turn ${c.turn}?`,
        message: `${p.files.length ? `These files change:\n${shown}${more}` : 'No file changes: the files already match this turn.'}\n\nYour branch and HEAD stay as they are. Files ignored by git are not restored. The old conversation is kept; a new panel continues from this turn.${p.notes.length ? `\n\n${p.notes.join('\n')}` : ''}`,
        confirm: `Restore to turn ${c.turn}`,
        danger: true,
      })
      if (!ok) return
      const r = await window.stm.control.checkpointRestore(props.sid, c.turn)
      window.dispatchEvent(new CustomEvent('stm:open-resumed', { detail: { cwd: props.cwd, resume: r.resume.sessionId, resumeAt: r.resume.messageUuid } }))
      props.onClose()
    } catch (e) {
      setErr(clean(e))
    } finally {
      setWorking(null)
    }
  }
  return (
    <Card title="Checkpoints" sub="The files are saved at the end of each turn, on private refs that never touch your branches. Restoring puts the files back and continues the conversation from that turn in a new panel." onClose={props.onClose}>
      {props.busy && <div className="notice">This panel is working. Stop it before restoring.</div>}
      {err && <div className="notice error" role="alert">{err}</div>}
      {list === null ? <div className="faint">Reading…</div> : list.length === 0 ? (
        <div className="cp-note">No checkpoints yet. One is saved when a turn ends in a git project.</div>
      ) : (
        <ul className="cp-list">
          {list.map((c) => (
            <li key={c.ref}>
              <span className="cp-turn">Turn {c.turn}</span>
              <span className="faint">{ago(c.at)}</span>
              <span className="spacer-flex" />
              <button className="ghost small" disabled={props.busy || working !== null} onClick={() => void restore(c)}>{working === c.turn ? 'Checking…' : `Restore to turn ${c.turn}`}</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Breakpoints(props: { list: Bp[]; onChange: (l: Bp[]) => Promise<void>; onClose: () => void }) {
  const [tool, setTool] = useState('')
  const [err, setErr] = useState('')
  const change = (l: Bp[]) => props.onChange(l).catch((e) => setErr(clean(e)))
  const afterPlan = props.list.some((b) => b.kind === 'afterPlan')
  return (
    <Card title="Breakpoints" sub="A breakpoint holds the call and shows a card. Approve lets it run; Deny ends it with a message the model sees. Unattended runs deny instead of waiting." onClose={props.onClose}>
      {err && <div className="notice error" role="alert">{err}</div>}
      <div className="tid-row">
        <span>Stop after the plan is written</span>
        <Switch aria-label="Stop after the plan is written" checked={afterPlan} onChange={(e) => void change(setAfterPlan(props.list, e.target.checked))} />
      </div>
      <form className="ctl-row" onSubmit={(e) => (e.preventDefault(), void change(withBefore(props.list, tool)), setTool(''))}>
        <label className="ctl-fld" style={{ flex: 1 }}><span>Before this tool (name or pattern)</span><input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="Bash, Write, mcp__stm__*" spellCheck={false} /></label>
        <button className="primary small" type="submit" disabled={!tool.trim()}>Add</button>
      </form>
      <ul className="bp-list" aria-label="Breakpoints before a tool">
        {props.list.filter((b) => b.kind === 'before').length === 0 && <li className="faint">No tool is held.</li>}
        {props.list.map((b, i) => b.kind === 'before' && (
          <li key={i}><span className="mono">{b.tool}</span><span className="spacer-flex" /><button className="ghost small" aria-label={`Remove ${b.tool}`} onClick={() => void change(props.list.filter((x) => x !== b))}>Remove</button></li>
        ))}
      </ul>
    </Card>
  )
}
