import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './bridge'

type Found = Awaited<ReturnType<typeof window.stm.memoryNode>>

/** A memory citation in an answer, [mem:id]: a chip that opens the exact entry the answer used. */
export function MemCite({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const [found, setFound] = useState<Found | undefined>()
  const [at, setAt] = useState({ x: 0, y: 0 })
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <>
      <button
        className="mem-cite"
        title="From this project's memory: open the entry"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: Math.max(8, Math.min(r.left, window.innerWidth - 436)), y: Math.min(r.bottom + 6, window.innerHeight - 260) })
          setOpen(!open)
          if (found === undefined) void window.stm.memoryNode(id).then(setFound, () => setFound(null))
        }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 2h10v12l-5-3-5 3z" /></svg>
        {id}
      </button>
      {open &&
        createPortal(
          <div className="mem-pop" ref={pop} style={{ left: at.x, top: at.y }} role="dialog" aria-label={`Memory ${id}`}>
            {found === undefined && <div className="faint">Reading the memory…</div>}
            {found === null && <div className="faint">This entry is no longer in memory; it was edited or removed.</div>}
            {found && (
              <>
                <div className="mem-pop-head">
                  <span className="mem-kind">{found.node.kind}</span>
                  <b>{found.node.title}</b>
                  <span className="faint">{[found.project, found.node.date].filter(Boolean).join(' · ')}</span>
                </div>
                <pre className="mem-body">{found.node.body || found.node.summary}</pre>
                <div className="faint mem-file">{found.node.file}</div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
