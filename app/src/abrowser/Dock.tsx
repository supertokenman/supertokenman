import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { IconAdd, IconBack, IconClose, IconForward, IconRefresh } from '../icons'
import { StateMark, type MarkState } from '../StateMark'
import { AskCards } from './Cards'
import { addressOf, scopeLabel, shortUrl, shownPanel, statusOf, type Status } from './model'
import { Profiles } from './Profiles'
import type { Ask, PaneState, Profile } from './types'
import './abrowser.css'

const api = () => window.stm.agentBrowser
const MARK: Record<Status['kind'], { state: MarkState; shape?: 'circle' | 'triangle' | 'cut' | 'square' }> = {
  secret: { state: 'warn', shape: 'cut' },
  held: { state: 'warn', shape: 'cut' },
  stopped: { state: 'down', shape: 'square' },
  driving: { state: 'busy', shape: 'triangle' },
  idle: { state: 'off', shape: 'circle' },
}

/**
 * The agent browser beside the panels. The page itself is a native view that the main process places over
 * the "view" box below (this component only reports where that box is); everything around it is ours: who
 * drives, take over and hand back, tabs, address, the asks, and the profile.
 */
export function Dock(props: { focus: string | null; panels: string[]; names: Record<string, string> }) {
  const [states, setStates] = useState<Record<string, PaneState>>({})
  const [changed, setChanged] = useState<Record<string, number>>({})
  const [asks, setAsks] = useState<Ask[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [hidden, setHidden] = useState(false)
  const [more, setMore] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [wipe, setWipe] = useState(false)
  // something of ours (a menu, a sheet, a dialog) is over the page: the native view steps aside for a still picture
  const [covered, setCovered] = useState(false)
  const [still, setStill] = useState<string | null>(null)
  const view = useRef<HTMLDivElement>(null)
  const side = useRef<HTMLElement>(null)

  useEffect(() => {
    const b = api()
    for (const p of props.panels) void b.state(p).then((s) => s && setStates((o) => ({ ...o, [p]: s })), () => undefined)
    const off1 = b.onState((s) => {
      setStates((o) => {
        const was = o[s.panel]
        const moved = !was || was.step !== s.step || was.active !== s.active || was.held !== s.held || was.tabs.some((t, i) => t.loading !== s.tabs[i]?.loading || t.url !== s.tabs[i]?.url) || was.tabs.length !== s.tabs.length
        if (moved) setChanged((c) => ({ ...c, [s.panel]: Date.now() }))
        return { ...o, [s.panel]: s }
      })
    })
    const off2 = b.onAsk((a) => {
      setAsks((o) => [...o.filter((x) => x.id !== a.id), a])
      setHidden(false)
      // nobody answering for two minutes is a no in the main process; the card goes with it
      setTimeout(() => setAsks((o) => o.filter((x) => x.id !== a.id)), 120_000)
    })
    return () => (off1(), off2())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // the pane stays on its panel when the tabs are gone (a profile change closes them) while the panel lives
  const sticky = useRef<string | null>(null)
  let panel = shownPanel(states, props.focus, asks, changed)
  if (!panel && sticky.current && states[sticky.current] && props.panels.includes(sticky.current)) panel = sticky.current
  sticky.current = panel
  const s = panel ? states[panel] : undefined
  const name = panel ? props.names[panel] ?? 'The assistant' : 'The assistant'
  const status = s ? statusOf(s, name, now, changed[panel!] ?? 0) : null
  const tab = s?.tabs.find((t) => t.id === s.active) ?? s?.tabs[0]
  const held = Boolean(s?.held)
  const open = Boolean(s) && !hidden
  const shown = open && !covered

  // the address bar follows the page unless the person is typing in it
  useEffect(() => {
    if (!editing) setAddress(tab?.url ?? '')
  }, [tab?.url, editing])
  useEffect(() => {
    if (!held) setEditing(false)
  }, [held])
  useEffect(() => {
    setNote('')
    setWipe(false)
  }, [panel])
  useEffect(() => {
    if (panel) void api().profiles(panel).then((i) => setProfiles(i.list), () => undefined)
  }, [panel, s?.scope, more])

  // tell the main process where the page goes
  const report = useCallback(() => {
    if (!panel) return
    const el = view.current
    if (!el || !shown) return void api().bounds(panel, null)
    const r = el.getBoundingClientRect()
    void api().bounds(panel, { x: r.x, y: r.y, width: r.width, height: r.height })
  }, [panel, shown])
  const last = useRef('')
  useLayoutEffect(() => {
    last.current = ''
    const send = () => {
      const el = view.current
      const key = !el || !shown ? 'none' : (() => { const r = el.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}` })()
      if (key !== last.current) {
        last.current = key
        report()
      }
    }
    send()
    const ro = new ResizeObserver(send)
    if (view.current) ro.observe(view.current)
    if (side.current) ro.observe(side.current)
    window.addEventListener('resize', send)
    // the panels glide when one opens or closes; the pane moves with them
    const tick = setInterval(send, 400)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', send)
      clearInterval(tick)
      if (panel) void api().bounds(panel, null)
    }
  }, [report, shown, panel, asks.length, more, note])

  // is anything outside the pane drawn over the page box? The native view would hide it.
  const busy = useRef(false)
  const coveredNow = useRef(false)
  coveredNow.current = covered
  useEffect(() => {
    if (!open || !panel) return
    const over = () => {
      const el = view.current
      if (!el) return false
      const r = el.getBoundingClientRect()
      if (r.width < 20 || r.height < 20) return false
      const pts: [number, number][] = [[r.x + 10, r.y + 10], [r.right - 10, r.y + 10], [r.x + 10, r.bottom - 10], [r.right - 10, r.bottom - 10], [r.x + r.width / 2, r.y + r.height / 2]]
      return pts.some(([x, y]) => {
        const top = document.elementsFromPoint(x, y)[0]
        return Boolean(top) && !el.contains(top!)
      })
    }
    const check = async () => {
      if (busy.current) return
      const now = over()
      if (now === coveredNow.current) return
      busy.current = true
      try {
        if (now) setStill(await api().snap(panel).catch(() => null))
        else setStill(null)
        setCovered(now)
      } finally {
        busy.current = false
      }
    }
    const mo = new MutationObserver(() => void check())
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open'] })
    const t = setInterval(() => void check(), 200)
    return () => {
      mo.disconnect()
      clearInterval(t)
    }
  }, [open, panel])

  const answer = (id: string, a: 'once' | 'always' | 'deny') => {
    setAsks((o) => o.filter((x) => x.id !== id))
    void api().answer(id, a)
  }
  const go = async (op: Parameters<ReturnType<typeof api>['nav']>[1], url?: string) => setNote(await api().nav(panel!, op, url))

  const waiting = useMemo(() => asks, [asks])

  if (!s || !status || !panel) return null
  if (hidden) {
    return (
      <aside className="ab rail" aria-label="Agent browser">
        <button className="ab-rail-btn" onClick={() => setHidden(false)} aria-label="Show the agent browser">
          <span>Browser</span>
          {held && <StateMark state="warn" shape="cut" label="You have the browser" />}
        </button>
      </aside>
    )
  }
  const mark = MARK[status.kind]
  const budget = `${s.step} of ${s.budget.steps} steps`
  return (
    <aside className={`ab ${status.kind}`} ref={side} aria-label="Agent browser">
      <header className="ab-head">
        <StateMark state={mark.state} shape={mark.shape} label={status.label} />
        <div className="ab-who">
          <span className="ab-title">Browser</span>
          <span className="ab-panel faint">{name}</span>
        </div>
        <button className="icon" aria-label="Hide the browser" data-tip="Hide" onClick={() => setHidden(true)}>
          <IconClose />
        </button>
      </header>

      <div className={`ab-status ${status.kind}`} role="status" aria-live="polite">
        <div className="ab-status-text">
          <strong>{status.label}</strong>
          <span>{status.detail}</span>
        </div>
        {held ? (
          <button className="small primary" onClick={() => void api().release(panel)}>Give back</button>
        ) : (
          <button className="small" onClick={() => void api().take(panel)}>Take over</button>
        )}
      </div>

      <AskCards asks={waiting} names={props.names} onAnswer={answer} />

      <div className="ab-tabs" role="tablist" aria-label="Browser tabs">
        {s.tabs.map((t) => (
          <div key={t.id} className="ab-tab" aria-selected={t.id === tab?.id}>
            <button role="tab" aria-selected={t.id === tab?.id} className="ab-tab-btn" onClick={() => void api().tab(panel, 'switch', t.id)}>
              <span className="ab-tab-title">{t.title || shortUrl(t.url) || 'New tab'}</span>
              {t.loading && <span className="ab-loading" aria-label="Loading" />}
            </button>
            {held && s.tabs.length > 1 && (
              <button className="icon" aria-label={`Close tab ${t.title || t.id}`} onClick={() => void api().tab(panel, 'close', t.id)}>
                <IconClose />
              </button>
            )}
          </div>
        ))}
        {held && s.tabs.length < 3 && (
          <button className="icon" aria-label="New tab" data-tip="New tab" onClick={() => void api().tab(panel, 'new').then(setNote)}>
            <IconAdd />
          </button>
        )}
      </div>

      <form
        className="ab-bar"
        onSubmit={(e) => {
          e.preventDefault()
          setEditing(false)
          void go('go', addressOf(address))
        }}
      >
        <button type="button" className="icon" aria-label="Back" data-tip="Back" disabled={!held} onClick={() => void go('back')}>
          <IconBack />
        </button>
        <button type="button" className="icon" aria-label="Forward" data-tip="Forward" disabled={!held} onClick={() => void go('forward')}>
          <IconForward />
        </button>
        <button type="button" className="icon" aria-label="Reload" data-tip="Reload" disabled={!held} onClick={() => void go(tab?.loading ? 'stop' : 'reload')}>
          <IconRefresh />
        </button>
        <input
          className="ab-url"
          aria-label={held ? 'Address' : 'Address (read only while the assistant drives)'}
          value={editing ? address : tab ? shortUrl(tab.url) : ''}
          readOnly={!held}
          spellCheck={false}
          autoComplete="off"
          onFocus={() => held && (setEditing(true), setAddress(tab?.url ?? ''))}
          onChange={(e) => setAddress(e.target.value)}
          onBlur={() => setEditing(false)}
        />
      </form>
      {note && <p className="ab-error" role="alert">{note}</p>}

      <div className="ab-view" ref={view} aria-label="Page" role="region">
        {still && covered && <img className="ab-still" src={still} alt="" />}
        {!tab && <p className="faint">No page is open. {name} opens one when it needs it.</p>}
      </div>

      <footer className="ab-foot">
        <span className="ab-budget faint">{budget}</span>
        <button className="small ghost" aria-expanded={more} onClick={() => setMore((v) => !v)}>
          {scopeLabel(s.scope, profiles)}
        </button>
      </footer>
      {more && (
        <div className="ab-more">
          <Profiles panel={panel} stamp={s.scope} />
          <div className="ab-prof-row">
            <span className="ab-label">Sign-ins in this profile</span>
            {wipe ? (
              <span className="ab-inline">
                <button className="small danger" onClick={() => void api().clear(panel).then(() => setWipe(false))}>Clear cookies and storage</button>
                <button className="small ghost" onClick={() => setWipe(false)}>Keep</button>
              </span>
            ) : (
              <button className="small" onClick={() => setWipe(true)}>Clear profile</button>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
