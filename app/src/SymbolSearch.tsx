import { useEffect, useRef, useState } from 'react'
import { merge, searchSymbols, type Sym } from '../shared/symbols'
import { normalize } from '../electron/markets'

/**
 * The Markets add field: suggestions from the built-in list as you type, and from Yahoo Finance's search
 * (the quotes' own source) when the list has few, after a pause. Arrows move, Enter adds, Escape closes.
 */
export function SymbolSearch({ watch, onAdd }: { watch: string[]; onAdd: (add: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [remote, setRemote] = useState<{ q: string; list: Sym[] } | null>(null)
  const [looking, setLooking] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const local = searchSymbols(q)
  const list = merge(local, remote && remote.q === q.trim() ? remote.list : [])
  const have = new Set(watch.map((w) => normalize(w).label))

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2 || local.length >= 5) return
    let live = true
    const timer = setTimeout(() => {
      setLooking(true)
      window.stm.searchSymbols(t).then((l) => live && setRemote({ q: t, list: l }), () => live && setRemote({ q: t, list: [] })).finally(() => live && setLooking(false))
    }, 350)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [q, local.length])

  useEffect(() => {
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [])

  const pick = (add: string) => {
    if (!add.trim()) return
    onAdd(add.trim().toUpperCase())
    setQ('')
    setHi(0)
    setOpen(false)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHi((h) => Math.min(list.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(open && list[hi] ? list[hi].add : q)
    } else if (e.key === 'Escape' && open && q) {
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()
      setOpen(false)
    }
  }
  const shown = open && q.trim().length > 0

  return (
    <div className="sym" ref={box}>
      <input
        className="mk-add"
        value={q}
        role="combobox"
        aria-expanded={shown}
        aria-controls="sym-list"
        aria-activedescendant={shown && list[hi] ? `sym-${hi}` : undefined}
        onChange={(e) => (setQ(e.target.value), setHi(0), setOpen(true))}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Add a stock, coin or currency"
        spellCheck={false}
      />
      {shown && (
        <div className="sym-list" id="sym-list" role="listbox">
          {list.map((s, i) => {
            const added = have.has(normalize(s.add).label)
            return (
              <button key={s.add} id={`sym-${i}`} role="option" aria-selected={i === hi} className={`sym-row ${i === hi ? 'on' : ''}`} onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s.add)}>
                <span className="sym-ticker">{s.ticker}</span>
                <span className="sym-name">{s.name}</span>
                {added ? <span className="sym-tag added">Added</span> : <span className="sym-tag">{s.market}</span>}
              </button>
            )
          })}
          {looking && <div className="sym-foot faint">Looking up “{q.trim()}” on Yahoo Finance…</div>}
          {!looking && !list.length && (
            <div className="sym-foot faint">
              Nothing found. Press Enter to add <b className="mono">{q.trim().toUpperCase()}</b> as typed.
            </div>
          )}
          {!looking && list.length > 0 && <div className="sym-foot faint">↑ ↓ to move, Enter to add</div>}
        </div>
      )}
    </div>
  )
}
