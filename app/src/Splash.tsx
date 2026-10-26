import { useEffect, useState } from 'react'
import { bootOn } from './boot'

const MAX_MS = 6000
const FULL_MS = 3000
const SHORT_MS = 900
const LAST = 'stm.intro.last'

const today = () => new Date().toISOString().slice(0, 10)
const seenToday = () => {
  try {
    return localStorage.getItem(LAST) === today()
  } catch {
    return false
  }
}

/**
 * The opening: white, quiet, like a product film. Two short lines rise out of a blur and settle, give way
 * to the name over a thin accent rule. The full film plays once a day; after that only the name.
 */
export function Splash({ done }: { done: boolean }) {
  const [full] = useState(() => !seenToday() && bootOn())
  const [phase, setPhase] = useState<'on' | 'leaving' | 'gone'>('on')
  const [started] = useState(() => Date.now())
  useEffect(() => {
    try {
      localStorage.setItem(LAST, today())
    } catch {
      // only decides the long or short film
    }
  }, [])
  // never longer than MAX_MS from the start, whatever re-renders happen meanwhile
  useEffect(() => {
    const t = setTimeout(() => setPhase((p) => (p === 'on' ? 'leaving' : p)), MAX_MS)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!done) return
    const wait = Math.max(0, (full ? FULL_MS : SHORT_MS) - (Date.now() - started))
    const t = setTimeout(() => setPhase('leaving'), wait)
    return () => clearTimeout(t)
  }, [done, started, full])
  useEffect(() => {
    if (phase !== 'leaving') return
    const t = setTimeout(() => setPhase('gone'), 620)
    return () => clearTimeout(t)
  }, [phase])
  if (phase === 'gone') return null
  return (
    <div className={`splash film ${full ? 'full' : 'short'} ${phase}`} aria-hidden="true">
      {full && (
        <div className="film-lines">
          <span className="film-line l1">Every token.</span>
          <span className="film-line l2">In plain sight.</span>
        </div>
      )}
      <div className="film-mark">
        <span className="film-name">SuperTokenMan</span>
        <i className="film-rule" />
        <span className="film-sub">{done ? 'Ready' : 'Starting Claude Code'}</span>
      </div>
    </div>
  )
}
