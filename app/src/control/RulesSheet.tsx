import { useEffect, useMemo, useRef, useState } from 'react'
import './control.css'
import { IconClose } from '../icons'
import { NumberField } from '../ui'
import { clean } from '../errors'
import { parseRules } from '../../shared/policyrules'
import { broadAllows } from '../../shared/rulewarn'
import { testInput } from '../../shared/controlview'
import type { Caps, PolicyState, TestResult } from './types'

const EXAMPLE = `# never delete recursively outside the project
deny Bash when cmd matches "rm -rf *" and path outside $project -- recursive delete outside project
# push only to claude/* branches
deny Bash when cmd matches "git push*" unless branch matches "claude/*"
# any network command asks
ask network
# reads in the project run without a card
allow read when path inside $project`

type Tab = 'global' | 'project' | 'limits'

/** Settings > Control: the rules files (global and per project), a dry run for one call, and the routine limits. */
export function RulesSheet(props: { cwd?: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('global')
  const [state, setState] = useState<PolicyState | null>(null)
  const [texts, setTexts] = useState<{ global: string; project: string }>({ global: '', project: '' })
  const [saved, setSaved] = useState<{ global: string; project: string }>({ global: '', project: '' })
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => {
    window.stm.control.policyRead(props.cwd).then(
      (s) => {
        setState(s)
        const t = { global: s.global.text, project: s.project?.text ?? '' }
        setTexts(t)
        setSaved(t)
      },
      (e) => setErr(clean(e)),
    )
  }, [props.cwd])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const scope = tab === 'project' ? 'project' : 'global'
  const text = texts[scope]
  const dirty = tab !== 'limits' && text !== saved[scope]
  const parsed = useMemo(() => parseRules(text), [text])
  const warns = useMemo(() => broadAllows(parsed.rules), [parsed])
  const ta = useRef<HTMLTextAreaElement>(null)
  const gut = useRef<HTMLPreElement>(null)
  const lines = Math.max(1, text.split('\n').length)
  const bad = new Set(parsed.errors.map((e) => e.line))
  const wr = new Set(warns.map((w) => w.line))
  const jump = (line: number) => {
    const el = ta.current
    if (!el) return
    const at = text.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0)
    el.focus()
    el.setSelectionRange(at, at + (text.split('\n')[line - 1]?.length ?? 0))
  }
  const save = async () => {
    setErr('')
    try {
      const r = await window.stm.control.policyWrite(scope, props.cwd ?? '', text)
      setSaved({ ...saved, [scope]: text })
      setNote(r.errors.length ? `Saved. ${r.errors.length === 1 ? '1 line is ignored' : `${r.errors.length} lines are ignored`} until fixed.` : 'Saved. Rules apply to the next call.')
    } catch (e) {
      setErr(clean(e))
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet observe control${tab === 'limits' ? ' short' : ''}`} role="dialog" aria-label="Control rules">
        <header className="sheet-head">
          <div className="sheet-title">Control</div>
          <div className="segmented" role="tablist" aria-label="Rules scope">
            <button role="tab" aria-selected={tab === 'global'} onClick={() => setTab('global')}>Global rules</button>
            <button role="tab" aria-selected={tab === 'project'} disabled={!props.cwd} data-tip={props.cwd ? props.cwd : 'Open a panel in a project to edit its rules'} onClick={() => setTab('project')}>Project rules</button>
            <button role="tab" aria-selected={tab === 'limits'} onClick={() => setTab('limits')}>Routine limits</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="sheet-body">
          {err && <div className="notice error" role="alert">{err}</div>}
          {tab === 'limits' ? (
            <Limits />
          ) : !state ? (
            <div className="faint">Reading the rules…</div>
          ) : (
            <div className="ctl-body">
              <div className="ctl-col">
                <p className="ctl-help">
                  One rule per line: <code>deny|ask|allow</code> a tool, optionally <code>when</code> and <code>unless</code> conditions. Deny beats ask beats allow. A line that does not parse is ignored and never becomes an allow.
                </p>
                <div className="ctl-path">{(scope === 'global' ? state.global.path : state.project?.path) ?? ''}</div>
                <div className="ctl-editor">
                  <pre className="ctl-gutter" ref={gut} aria-hidden="true">
                    {Array.from({ length: lines }, (_, i) => (
                      <div key={i} className={bad.has(i + 1) ? 'bad' : wr.has(i + 1) ? 'warn' : ''}>{i + 1}</div>
                    ))}
                  </pre>
                  <textarea
                    ref={ta}
                    aria-label={`${scope === 'global' ? 'Global' : 'Project'} rules`}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="ask network"
                    value={text}
                    onChange={(e) => (setNote(''), setTexts({ ...texts, [scope]: e.target.value }))}
                    onScroll={(e) => gut.current && (gut.current.scrollTop = e.currentTarget.scrollTop)}
                  />
                </div>
                {(parsed.errors.length > 0 || warns.length > 0) && (
                  <ul className="ctl-issues" aria-label="Problems in the rules">
                    {parsed.errors.map((e) => (
                      <li key={`e${e.line}`} className="err">
                        <span className="tag">Error</span>
                        <span>Line {e.line}: {e.message}. <button onClick={() => jump(e.line)}>Go to line</button></span>
                      </li>
                    ))}
                    {warns.map((w) => (
                      <li key={`w${w.line}`} className="hint">
                        <span className="tag">Broad</span>
                        <span>Line {w.line}: {w.message} <button onClick={() => jump(w.line)}>Go to line</button></span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="ctl-row">
                  <button className="primary small" disabled={!dirty} onClick={() => void save()}>Save rules</button>
                  <button className="ghost small" disabled={!dirty} onClick={() => setTexts({ ...texts, [scope]: saved[scope] })}>Revert</button>
                  {!text.trim() && <button className="ghost small" onClick={() => setTexts({ ...texts, [scope]: EXAMPLE })}>Insert examples</button>}
                  <span className="faint" role="status" aria-live="polite">{note || (dirty ? 'Unsaved changes' : '')}</span>
                </div>
                {state[scope]?.unreadable && <div className="notice error">The file could not be read: {state[scope]!.unreadable}</div>}
              </div>
              <TestBox cwd={props.cwd} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Dry run: which rule decides a call, without running it. */
function TestBox(props: { cwd?: string }) {
  const [tool, setTool] = useState('Bash')
  const [value, setValue] = useState('')
  const [res, setRes] = useState<TestResult | null>(null)
  const [err, setErr] = useState('')
  const run = async () => {
    setErr('')
    try {
      setRes(await window.stm.control.policyTest(tool.trim() || 'Bash', testInput(tool.trim(), value), props.cwd))
    } catch (e) {
      setRes(null)
      setErr(clean(e))
    }
  }
  return (
    <form className="ctl-col" onSubmit={(e) => (e.preventDefault(), void run())} aria-label="Test a call">
      <div className="sheet-title">Test a call</div>
      <p className="ctl-help">See what the rules would do with a call. Nothing runs.</p>
      <label className="ctl-fld"><span>Tool</span><input value={tool} onChange={(e) => setTool(e.target.value)} spellCheck={false} placeholder="Bash, Write, WebFetch" /></label>
      <label className="ctl-fld"><span>{/^(Read|Grep|Glob|Write|Edit|MultiEdit|NotebookEdit|read|write)$/.test(tool) ? 'Path' : tool === 'WebFetch' ? 'Address' : 'Command'}</span><input value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} placeholder="git push origin main" /></label>
      <div className="ctl-row"><button className="primary small" type="submit" disabled={!value.trim()}>Test</button></div>
      {err && <div className="notice error" role="alert">{err}</div>}
      {res && (
        <div className={`ctl-verdict ${res.decision}`} role="status" aria-live="polite">
          <b>{res.decision}</b>
          <span>{res.rule ? `By rule ${res.rule}` : res.by === 'default' ? 'No rule matches; the usual approval applies.' : `Decided by ${res.by}.`}</span>
          {res.why && <span className="faint">{res.why}</span>}
          {res.existing !== res.decision && <span className="faint">Without rules this would be: {res.existing}.</span>}
        </div>
      )}
    </form>
  )
}

/** Routine limits: how often and how many routines may run on their own. */
function Limits() {
  const [info, setInfo] = useState<{ caps: Caps; enabled: number } | null>(null)
  const [c, setC] = useState<Caps | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    void window.stm.triggers.caps().then((i) => (setInfo(i), setC(i.caps)), (e) => setMsg(clean(e)))
  }, [])
  if (!info || !c) return <div className="faint">{msg || 'Reading the limits…'}</div>
  const set = (k: keyof Caps, v: string) => setC({ ...c, [k]: Math.max(1, Math.floor(Number(v)) || 1) })
  return (
    <div className="ctl-col">
      <p className="ctl-help">Triggers and routines run on their own, so they are limited. You can lower these limits but not go past the app's ceiling: every 5 minutes, 50 enabled, 3 failures.</p>
      <div className="ctl-limits">
        <label className="ctl-fld"><span>Shortest interval (minutes)</span><NumberField min={5} value={c.minEvery} onChange={(e) => set('minEvery', e.target.value)} /></label>
        <label className="ctl-fld"><span>Most enabled at once</span><NumberField min={1} max={50} value={c.maxEnabled} onChange={(e) => set('maxEnabled', e.target.value)} /></label>
        <label className="ctl-fld"><span>Switch off after failed runs</span><NumberField min={3} value={c.maxFailures} onChange={(e) => set('maxFailures', e.target.value)} /></label>
      </div>
      <div className="ctl-row">
        <button className="primary small" onClick={() => void window.stm.triggers.setCaps(c).then((i) => (setInfo(i), setC(i.caps), setMsg('Saved.')), (e) => setMsg(clean(e)))}>Save limits</button>
        <span className="faint" role="status" aria-live="polite">{msg || `${info.enabled} of ${info.caps.maxEnabled} enabled now.`}</span>
      </div>
    </div>
  )
}

