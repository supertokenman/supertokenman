import { useEffect, useState } from 'react'
import type { Line } from './state'

export type LoaderStyle = 'auto' | 'bars' | 'orbit' | 'pulse' | 'scan'
export const LOADERS: { id: LoaderStyle; name: string }[] = [
  { id: 'auto', name: 'Auto' },
  { id: 'bars', name: 'Bars' },
  { id: 'orbit', name: 'Orbit' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'scan', name: 'Scan' },
]
const KEY = 'stm.loader'
export const loaderStyle = (): LoaderStyle => {
  try {
    const v = localStorage.getItem(KEY) as LoaderStyle | null
    return LOADERS.some((l) => l.id === v) ? v! : 'auto'
  } catch {
    return 'auto'
  }
}
export const setLoaderStyle = (v: LoaderStyle) => {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    // storage off: the choice lasts this session
  }
  window.dispatchEvent(new Event('stm-loader'))
}

type Phase = { verb: string; what?: string; kind: 'think' | 'read' | 'run' | 'edit' | 'ask' }
const base = (p: string) => p.split('/').filter(Boolean).pop() ?? p

/** What the panel is doing now, from the last step it took this turn. */
export function phaseOf(lines: Line[]): Phase | null {
  const last = lines[lines.length - 1]
  if (!last || last.kind !== 'tool') return null
  const n = last.name
  const s = last.summary
  if (n === 'Read') return { verb: 'Reading', what: base(s), kind: 'read' }
  if (n === 'Grep' || n === 'Glob') return { verb: 'Searching', what: s, kind: 'read' }
  if (n === 'Bash') return { verb: 'Running', what: s.split('\n')[0], kind: 'run' }
  if (n === 'Edit' || n === 'Write' || n === 'MultiEdit' || n === 'NotebookEdit') return { verb: 'Editing', what: base(s), kind: 'edit' }
  if (n === 'WebFetch' || n === 'WebSearch') return { verb: 'On the web', what: s, kind: 'read' }
  if (n === 'Agent' || n === 'Task') return { verb: 'A helper is on it', kind: 'ask' }
  if (n === 'ToolSearch') return { verb: 'Finding the right tool', kind: 'think' }
  if (n === 'TodoWrite' || n.startsWith('Task')) return { verb: 'Planning', kind: 'think' }
  const m = /^mcp__([^_]+(?:[-_][^_]+)*)__(.+)$/.exec(n)
  if (m) return { verb: `Asking ${m[1]!.replace(/[-_]/g, ' ')}`, what: m[2]!.replace(/_/g, ' '), kind: 'ask' }
  return { verb: n, what: s, kind: 'run' }
}

const THINKING = ['Thinking', 'Reading the request', 'Planning', 'Weighing options', 'Connecting the dots', 'Working it out']
const BY_KIND: Record<Phase['kind'], Exclude<LoaderStyle, 'auto'>> = { think: 'orbit', read: 'scan', run: 'bars', edit: 'pulse', ask: 'orbit' }

/** The motion alone, for the panel and for the picker in Appearance. */
export function LoaderMark(props: { style: Exclude<LoaderStyle, 'auto'> }) {
  return (
    <span className={`ld ld-${props.style}`} aria-hidden="true">
      {props.style === 'bars' && <><i /><i /><i /></>}
      {props.style === 'orbit' && <><b /><i /></>}
      {props.style === 'pulse' && <i />}
      {props.style === 'scan' && <i />}
    </span>
  )
}

/** While Claude works: a motion that fits what it is doing, what that is, and for how long. */
export function Thinking(props: { lines: Line[] }) {
  const [pick, setPick] = useState(loaderStyle)
  const [t0] = useState(Date.now())
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const on = () => setPick(loaderStyle())
    window.addEventListener('stm-loader', on)
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.removeEventListener('stm-loader', on)
      clearInterval(t)
    }
  }, [])
  const phase = phaseOf(props.lines)
  const secs = Math.floor((now - t0) / 1000)
  const verb = phase?.verb ?? THINKING[Math.floor(secs / 4) % THINKING.length]!
  const style = pick === 'auto' ? BY_KIND[phase?.kind ?? 'think'] : pick
  return (
    <div className="thinking" role="status">
      <LoaderMark style={style} />
      <span className="th-verb" key={verb}>{verb}</span>
      {phase?.what && <span className="th-what">{phase.what}</span>}
      {secs >= 3 && <span className="th-time">{secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`}</span>}
    </div>
  )
}
