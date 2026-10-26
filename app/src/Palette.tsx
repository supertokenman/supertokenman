import { useEffect, useRef, useState } from 'react'
import { grouped, search, type Entry } from './fuzzy'

/**
 * ⌘K: type to reach anything. Enter runs the top match; with nothing matching, the text goes to the
 * focused panel's Claude, or to its shell when it starts with $.
 */
export function Palette(props: { entries: Entry[]; onAsk: (text: string) => void; onShell: (cmd: string) => void; onClose: () => void; onDismiss?: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    box.current?.focus()
  }, [])
  const shell = q.startsWith('$')
  const found = shell ? [] : grouped(search(props.entries, q, 14))
  const ask: Entry | null = q.trim() && !shell ? { id: 'ask', group: 'Claude', label: `Ask Claude: ${q.trim()}`, run: () => props.onAsk(q.trim()) } : null
  const run: Entry | null = shell && q.slice(1).trim() ? { id: 'shell', group: 'Shell', label: `Run: ${q.slice(1).trim()}`, run: () => props.onShell(q.slice(1).trim()) } : null
  const list = [...found, ...(ask ? [ask] : []), ...(run ? [run] : [])]
  const go = (e: Entry | undefined) => {
    if (!e) return
    props.onClose()
    e.run()
  }
  let lastGroup = ''

  return (
    <div className="overlay palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && (props.onDismiss?.(), props.onClose())}>
      <div className="palette" role="dialog" aria-label="Search everything">
        <div className="pal-input">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="4.75" /><path d="m10.5 10.5 3.25 3.25" /></svg>
          <input
            ref={box}
            value={q}
            placeholder="Go anywhere, ask Claude, or $ run a command"
            onChange={(e) => {
              setQ(e.target.value)
              setI(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') (props.onDismiss?.(), props.onClose())
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setI((n) => Math.min(list.length - 1, n + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setI((n) => Math.max(0, n - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                go(list[i])
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="pal-list" role="listbox">
          {list.map((e, n) => {
            const head = e.group !== lastGroup
            lastGroup = e.group
            return (
              <div key={e.id}>
                {head && <div className="pal-group">{e.group}</div>}
                <button role="option" aria-selected={n === i} className={`pal-item ${n === i ? 'on' : ''}`} onMouseEnter={() => setI(n)} onClick={() => go(e)}>
                  <span className="pal-label">{e.label}</span>
                  {e.hint && <span className="pal-hint">{e.hint}</span>}
                </button>
              </div>
            )
          })}
          {list.length === 0 && <div className="pal-empty">Type to search</div>}
        </div>
      </div>
    </div>
  )
}
