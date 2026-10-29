import { useEffect, useRef } from 'react'
import { remembered } from './FolderPicker'
import { IconFolder } from './icons'

/** Panels side by side, as dots: # outline, * accent, anything else a faint dot. Same idea as the site's data-dots. */
const PICTURE = [
  '###########  ###########  ###########',
  '#.........#  #.........#  #.........#',
  '#.***.....#  #.***.....#  #.........#',
  '#.........#  #.........#  #.***.....#',
  '#.*****...#  #.*****...#  #.........#',
  '#.........#  #.........#  #.*****...#',
  '#.***.....#  #.........#  #.........#',
  '#.........#  #.........#  #.***.....#',
  '#.........#  #.........#  #.........#',
  '###########  ###########  ###########',
].map((r) => r.replace(/\./g, ' '))

function Dots() {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const draw = () => {
      const cols = PICTURE[0]!.length
      const w = el.clientWidth
      if (!w) return
      const cell = w / cols
      const h = cell * PICTURE.length
      const dpr = devicePixelRatio || 1
      const c = el.querySelector('canvas')!
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
      c.style.height = `${h}px`
      const x = c.getContext('2d')!
      x.setTransform(dpr, 0, 0, dpr, 0, 0)
      const css = getComputedStyle(document.documentElement)
      const ink = css.getPropertyValue('--text').trim()
      const acc = css.getPropertyValue('--accent').trim()
      const faint = css.getPropertyValue('--faint').trim()
      PICTURE.forEach((r, y) =>
        [...r].forEach((ch, i) => {
          if (ch === ' ' && (r[i - 1] === ' ' || r[i + 1] === ' ')) return
          const hit = ch === '#' ? [ink, 0.34] : ch === '*' ? [acc, 0.4] : [faint, 0.12]
          x.globalAlpha = ch === '#' ? 0.85 : 1
          x.fillStyle = hit[0] as string
          x.beginPath()
          x.arc(i * cell + cell / 2, y * cell + cell / 2, cell * (hit[1] as number), 0, 7)
          x.fill()
        }),
      )
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(el)
    // a theme change rewrites the root's variables
    const mo = new MutationObserver(draw)
    mo.observe(document.documentElement, { attributes: true })
    return () => (ro.disconnect(), mo.disconnect())
  }, [])
  return (
    <div className="es-dots" ref={box} aria-hidden="true">
      <canvas />
    </div>
  )
}

const folderName = (d: string) => d.split('/').filter(Boolean).slice(-1)[0] || d
const parentOf = (d: string) => {
  const p = d.split('/').filter(Boolean).slice(-3, -1).join('/')
  return p ? `…/${p}` : '/'
}

/** What the window shows with no panel open: a way back in, with the person's own folders first. */
export function EmptyStart(props: { recents: string[]; lastCount: number; onFolder: (dir: string) => void; onPick: () => void; onTemplate: () => void; onReopen: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const dirs = [...new Set([...remembered(), ...props.recents])].slice(0, 4)
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
  }, [])
  const onKey = (e: React.KeyboardEvent) => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']
    if (!keys.includes(e.key)) return
    const all = Array.from(root.current?.querySelectorAll<HTMLElement>('button') ?? [])
    const at = all.indexOf(document.activeElement as HTMLElement)
    e.preventDefault()
    const next = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? Math.min(all.length - 1, at + 1) : Math.max(0, at - 1)
    all[next]?.focus()
  }
  return (
    <div className="empty empty-start" ref={root} onKeyDown={onKey}>
      <div className="es-inner">
        <Dots />
        <h2 className="es-head">start a panel.</h2>
        {dirs.length > 0 && (
          <div className="es-cards" role="group" aria-label="Recent folders">
            {dirs.map((d) => (
              <button key={d} className="es-card" onClick={() => props.onFolder(d)} data-tip={d}>
                <IconFolder />
                <span className="es-name">{folderName(d)}</span>
                <span className="es-path">{parentOf(d)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="es-acts">
          <button className="primary" onClick={props.onPick}>
            Open a folder…
          </button>
          <button className="ghost" onClick={props.onTemplate}>
            New project from template…
          </button>
          {props.lastCount > 0 && (
            <button className="ghost" onClick={props.onReopen}>
              Reopen last session
            </button>
          )}
        </div>
        <div className="es-hint">
          <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> to open, <kbd>⌘T</kbd> for a panel in the same folder
        </div>
      </div>
    </div>
  )
}
