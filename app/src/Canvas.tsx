import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PanelLinkView } from './bridge'
import { clampZoom, fit, linkEnds, place, uniquePairs, zoomAt, type Point, type View } from '../shared/canvas'

/** Optional on purpose: older bridges send links without a spend. */
type LinkInfo = PanelLinkView

const POS_KEY = 'stm.canvas.pos'
const VIEW_KEY = 'stm.canvas.view'
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage off: the canvas lasts this session
  }
}

/** Panels as cards on a surface you pan and zoom, with their links drawn underneath. */
export function Canvas(props: { order: string[]; panel: (sid: string) => ReactNode }) {
  const [pos, setPos] = useState<Record<string, Point>>(() => load(POS_KEY, {}))
  const [view, setView] = useState<View>(() => {
    const v = load<View | null>(VIEW_KEY, null)
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y, zoom: clampZoom(v.zoom) } : { x: 0, y: 0, zoom: 1 }
  })
  const [links, setLinks] = useState<Record<string, LinkInfo[]>>({})
  const [space, setSpace] = useState(false)
  const [moving, setMoving] = useState(false)
  const [roomOpen, setRoomOpen] = useState(false)
  const [roomText, setRoomText] = useState('')
  const [roomMsg, setRoomMsg] = useState('')
  const [roomLeft, setRoomLeft] = useState(0)
  const surf = useRef<HTMLDivElement>(null)
  const rects = useMemo(() => place(props.order, pos), [props.order.join('|'), pos])

  useEffect(() => save(VIEW_KEY, view), [view])
  // only the open panels' spots are kept, so closed ones do not pile up
  useEffect(() => save(POS_KEY, Object.fromEntries(props.order.map((s) => [s, { x: rects[s]!.x, y: rects[s]!.y }]))), [rects])

  useEffect(() => {
    let live = true
    void window.stm.panelBus.links().then((v) => live && setLinks(v))
    const off = window.stm.panelBus.onLinks(setLinks)
    return () => {
      live = false
      off()
    }
  }, [])

  // space held turns any drag into a pan, as in drawing apps; not while typing
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
    const down = (e: KeyboardEvent) => e.code === 'Space' && !typing(e) && setSpace(true)
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ctrl/cmd + wheel and trackpad pinch (which arrives as wheel with ctrlKey) zoom; passive:false to stop page zoom
  useEffect(() => {
    const el = surf.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const b = el.getBoundingClientRect()
      setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.01), e.clientX - b.left, e.clientY - b.top))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const drag = (e: React.PointerEvent, move: (dx: number, dy: number) => void) => {
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY
    setMoving(true)
    const mv = (m: PointerEvent) => move(m.clientX - sx, m.clientY - sy)
    const up = () => {
      setMoving(false)
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }
  const pan = (e: React.PointerEvent) => {
    const v0 = view
    drag(e, (dx, dy) => setView({ ...v0, x: v0.x + dx, y: v0.y + dy }))
  }
  const onSurface = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (space || e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('cv-links')) pan(e)
  }
  const onCard = (sid: string) => (e: React.PointerEvent) => {
    if (e.button !== 0 || space) return
    const t = e.target as HTMLElement
    // the header moves the card; its buttons and fields keep working
    if (!t.closest('.panel-bar') || t.closest('button, input, textarea, select, a, [role="button"], [contenteditable="true"]')) return
    const r0 = rects[sid]!, z = view.zoom
    drag(e, (dx, dy) => setPos((p) => ({ ...p, [sid]: { x: r0.x + dx / z, y: r0.y + dy / z } })))
  }
  const frame = () => {
    const b = surf.current?.getBoundingClientRect()
    if (b) setView(fit(Object.values(rects), b.width, b.height))
  }

  const linkedIds = props.order.filter((s) => links[s]?.some((l) => props.order.includes(l.panel)))
  const nameOf = (s: string) => Object.values(links).flat().find((l) => l.panel === s)?.name ?? s
  const roomPost = async () => {
    try {
      const r = await window.stm.panelBus.roomPost!(linkedIds, roomText)
      setRoomMsg(`${nameOf(r.panel)} answers. ${r.left} more can take a turn.`)
      setRoomLeft(r.left)
      setRoomText('')
    } catch (e) {
      setRoomMsg(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    }
  }
  const roomNext = async () => {
    try {
      const r = await window.stm.panelBus.roomNext!()
      setRoomMsg(`Turn passed to ${nameOf(r.panel)}${r.delivery === 'auto' ? '' : ' (waits in its composer)'}. ${r.left} left.`)
      setRoomLeft(r.left)
    } catch (e) {
      setRoomMsg(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    }
  }

  const pairs = uniquePairs(links).filter(([a, b]) => rects[a] && rects[b])
  return (
    <div ref={surf} className={`canvas ${space ? 'panning' : ''} ${moving ? 'moving' : ''}`} onPointerDownCapture={(e) => space && (e.stopPropagation(), pan(e))} onPointerDown={onSurface}>
      <div className="cv-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className="cv-links" aria-hidden="true">
          {pairs.map(([a, b]) => {
            const [p, q] = linkEnds(rects[a]!, rects[b]!)
            const l = links[a]!.find((x) => x.panel === b)!
            const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2
            // a gentle bend reads as a link rather than a ruler line
            const cx = mx - (q.y - p.y) * 0.12, cy = my + (q.x - p.x) * 0.12
            const label = `${l.auto ? 'auto' : 'waits'}${l.spent ? ` · $${l.spent.usd.toFixed(2)}${l.capUsd ? ` of $${l.capUsd.toFixed(2)}` : ''}` : ''}`
            return (
              <g key={`${a}|${b}`} className={l.auto ? 'auto' : ''}>
                <path d={`M${p.x},${p.y} Q${cx},${cy} ${q.x},${q.y}`} />
                <text x={(p.x + 2 * cx + q.x) / 4} y={(p.y + 2 * cy + q.y) / 4 - 6} textAnchor="middle">{label}</text>
              </g>
            )
          })}
        </svg>
        {props.order.map((sid) => {
          const r = rects[sid]!
          return (
            <div key={sid} className="cv-card" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} onPointerDown={onCard(sid)}>
              {props.panel(sid)}
            </div>
          )
        })}
      </div>
      <div className="cv-tools">
        <button className="ghost" onClick={() => setView((v) => zoomAt(v, 1 / 1.2, (surf.current?.clientWidth ?? 0) / 2, (surf.current?.clientHeight ?? 0) / 2))} aria-label="Zoom out" data-tip="Zoom out">-</button>
        <span className="cv-zoom">{Math.round(view.zoom * 100)}%</span>
        <button className="ghost" onClick={() => setView((v) => zoomAt(v, 1.2, (surf.current?.clientWidth ?? 0) / 2, (surf.current?.clientHeight ?? 0) / 2))} aria-label="Zoom in" data-tip="Zoom in">+</button>
        <button className="ghost" onClick={frame} data-tip="Show every panel">Fit</button>
        {window.stm.panelBus.roomPost && linkedIds.length >= 2 && (
          <button className="ghost" onClick={() => setRoomOpen((o) => !o)} aria-expanded={roomOpen} data-tip="One message to the linked panels">Room</button>
        )}
      </div>
      {roomOpen && linkedIds.length >= 2 && (
        <div className="cv-room" onPointerDown={(e) => e.stopPropagation()}>
          <div className="cv-room-who">To {linkedIds.map((s) => `@${nameOf(s).trim().toLowerCase().replace(/\s+/g, '-')}`).join(' ')}. The named panel answers; the next turn goes over its link.</div>
          <textarea value={roomText} onChange={(e) => setRoomText(e.target.value)} placeholder="@name your message" rows={3} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && void roomPost()} />
          <div className="cv-room-row">
            <button onClick={() => void roomPost()} disabled={!roomText.trim()}>Send</button>
            <button className="ghost" onClick={() => void roomNext()} disabled={roomLeft < 1}>Next turn</button>
            <span>{roomMsg}</span>
          </div>
        </div>
      )}
    </div>
  )
}
