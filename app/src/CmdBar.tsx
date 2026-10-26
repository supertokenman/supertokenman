import { useEffect, useMemo, useRef, useState } from 'react'
import { riskOf, type Risk } from '../shared/cmdrisk'
import { ghost, search, type HistItem } from '../shared/termhist'
import { findRecipes, SOURCES } from '../shared/oneliners'
import { StateMark } from './StateMark'
import { clean } from './errors'

/** The risk of a command as a chip: nothing when safe. */
export function RiskChip(props: { risk: Risk }) {
  if (props.risk.level === 'safe') return null
  return (
    <span className={`risk-chip ${props.risk.level}`} title={props.risk.why}>
      <StateMark state={props.risk.level === 'blocked' ? 'down' : 'warn'} label={props.risk.level === 'blocked' ? 'Dangerous' : 'Asks'} />
      {props.risk.level === 'blocked' ? 'Dangerous' : 'Careful'}: {props.risk.why}
    </span>
  )
}

/**
 * The command bar over the terminal: type a command (the rest of a past one shows in grey; Tab takes
 * it), or describe what you want and Write it has the local model turn it into a command. Past
 * commands that match the words show below, by meaning. Nothing runs before Enter, and a dangerous
 * command asks once more.
 */
const RECIPE_HIT = new Set<string>()
export function CmdBar(props: { sid: string; history: HistItem[]; onClose: () => void; onRan: (cmd: string) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState<Risk | null>(null)
  const [pick, setPick] = useState(-1)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const rest = useMemo(() => ghost(props.history, text), [props.history, text])
  const found = useMemo(() => (text.trim().length > 1 ? search(props.history, text, 5).filter((h) => h.cmd !== text) : []), [props.history, text])
  // phase 113: recipes for what was typed in plain words; a pick goes into the bar, never runs
  const recipes = useMemo(() => findRecipes(text, /Mac/i.test(navigator.platform) ? 'mac' : 'linux', 5), [text])
  const risk = riskOf(text)
  const run = async (go: boolean, confirmed = false) => {
    const cmd = text.trim()
    if (!cmd) return
    const r = await window.stm.term.type(props.sid, cmd, go, confirmed)
    if (!r.ok && r.risk?.level === 'blocked') return setConfirm(r.risk)
    setConfirm(null)
    if (go) props.onRan(cmd)
    setText('')
    props.onClose()
  }
  const write = async () => {
    if (!text.trim()) return
    setBusy(true)
    setErr('')
    try {
      const r = await window.stm.term.suggest(props.sid, text)
      setText(r.cmd)
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
    input.current?.focus()
  }
  return (
    <div className="cmdbar" role="group" aria-label="Command bar">
      <div className="cmdbar-row">
        <span className="cmdbar-sign" aria-hidden>›</span>
        <div className="cmdbar-field">
          <span className="cmdbar-ghost" aria-hidden><span>{text}</span>{rest}</span>
          <input
            id={`cmdbar-${props.sid}`}
            ref={input}
            value={text}
            spellCheck={false}
            autoComplete="off"
            placeholder="A command, or what you want in plain words (Cmd+Enter writes it)"
            onChange={(e) => { setText(e.target.value); setConfirm(null); setPick(-1) }}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && rest) { e.preventDefault(); setText(text + rest) }
              else if (e.key === 'ArrowDown' && found.length) { e.preventDefault(); setPick((pick + 1) % found.length) }
              else if (e.key === 'ArrowUp' && found.length) { e.preventDefault(); setPick(pick <= 0 ? found.length - 1 : pick - 1) }
              else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void write() }
              else if (e.key === 'Enter' && pick >= 0) { e.preventDefault(); setText(found[pick]!.cmd); setPick(-1) }
              else if (e.key === 'Enter') { e.preventDefault(); void run(!e.altKey) }
              else if (e.key === 'Escape') { e.preventDefault(); props.onClose() }
            }}
          />
        </div>
        <button className="ghost small" disabled={busy || !text.trim()} onClick={() => void write()} title="The local model turns your words into one command (free)">{busy ? <><StateMark state="busy" label="Writing" /> Writing…</> : 'Write it'}</button>
        <button className="ghost small" disabled={!text.trim()} onClick={() => void run(false)} title="Types it into the terminal without running it (Alt+Enter)">Insert</button>
        <button className="primary small" disabled={!text.trim()} onClick={() => void run(true)}>Run</button>
      </div>
      {(risk.level !== 'safe' || err) && (
        <div className="cmdbar-note">
          <RiskChip risk={risk} />
          {err && <span className="cmdbar-err">{err}</span>}
        </div>
      )}
      {confirm && (
        <div className="cmdbar-confirm" role="alert">
          <span>This command {confirm.why}. Run it anyway?</span>
          <button className="ghost small" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="danger small" onClick={() => void run(true, true)}>Run anyway</button>
        </div>
      )}
      {recipes.length > 0 && !RECIPE_HIT.has(text) && (
        <div className="cmdbar-found cmdbar-recipes" role="listbox" aria-label="Recipes">
          {recipes.map((r) => (
            <button key={r.cmd} role="option" aria-selected={false} onClick={() => { RECIPE_HIT.add(r.cmd); setText(r.cmd); input.current?.focus() }} title={`${r.ask}. Goes into the bar; nothing runs until you press Run.`}>
              <span className="cmdbar-ask">{r.ask}</span>
              <code>{r.cmd}</code>
              {riskOf(r.cmd).level === 'ask' && <span className="pt-kind cmdbar-careful">careful</span>}
            </button>
          ))}
          <span className="faint cmdbar-credit">Recipes written for this app, after <a href={SOURCES[0]!.url} target="_blank" rel="noreferrer">{SOURCES[0]!.name}</a> and <a href={SOURCES[1]!.url} target="_blank" rel="noreferrer">{SOURCES[1]!.name}</a>.</span>
        </div>
      )}
      {found.length > 0 && (
        <div className="cmdbar-found" role="listbox" aria-label="Past commands">
          {found.map((h, i) => (
            <button key={h.cmd} role="option" aria-selected={i === pick} className={i === pick ? 'on' : ''} onClick={() => { setText(h.cmd); input.current?.focus() }}>
              <code>{h.cmd}</code>
              <span className="faint">{h.n > 1 ? `${h.n}×` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
