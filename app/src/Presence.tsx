import { Suspense, useEffect, useState, type ReactNode } from 'react'

/** How long the exit plays (motion.css: cut-out) before the children unmount. */
export const EXIT_MS = 220

/** Keeps its children mounted while they play their exit, marked data-leaving. */
export function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(show)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (show) {
      setMounted(true)
      setLeaving(false)
      return
    }
    if (!mounted) return
    setLeaving(true)
    const t = setTimeout(() => {
      setMounted(false)
      setLeaving(false)
    }, EXIT_MS)
    return () => clearTimeout(t)
  }, [show, mounted])
  if (!mounted) return null
  return (
    <div className="presence" data-leaving={leaving || undefined} style={{ display: 'contents' }}>
      {/* a sheet loaded on first open shows nothing for the moment it takes */}
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  )
}
