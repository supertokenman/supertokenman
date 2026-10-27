import { useEffect, useRef, useState } from 'react'
import { bootOn } from './boot'
import { displayCurrency, formatMoney } from './currency'
import { readRates } from './rates'

const MAX_MS = 6000
const FULL_MS = 2000
const SHORT_MS = 600
const COUNT_MS = 900
const COUNT_DELAY = 100
const LAST = 'stm.intro.last'
// Illustrative only: the motion shows what the app does (tokens counted, cost beside them). It is not
// anyone's usage and is never labelled as such.
const TOKENS = 1_284_600
const USD_PER_TOKEN = 6 / 1_000_000

const today = () => new Date().toISOString().slice(0, 10)
const seenToday = () => {
  try {
    return localStorage.getItem(LAST) === today()
  } catch {
    return false
  }
}
const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * The opening, in the window's own dark, built from the mark itself (build/icon.svg): the three bars fill
 * like meters while a token counter and its cost climb in step; the top bar takes the 45 degree cut, the
 * short bar lights in the accent, and the name is revealed where the counter was. Then it dissolves into
 * the app. Full once a day; otherwise the assembled mark with an accent sweep. Reduced motion: still.
 * Only transform, opacity and clip-path animate.
 */
export function Splash({ done }: { done: boolean }) {
  const [full] = useState(() => !seenToday() && bootOn())
  const [phase, setPhase] = useState<'on' | 'leaving' | 'gone'>('on')
  const [started] = useState(() => Date.now())
  const tokRef = useRef<HTMLSpanElement>(null)
  const costRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    try {
      localStorage.setItem(LAST, today())
    } catch {
      // only decides the long or short version
    }
  }, [])
  // the count writes straight to the two spans: no React render per frame
  useEffect(() => {
    if (!full) return
    const code = displayCurrency()
    const rate = readRates().USD
    const nf = new Intl.NumberFormat('en-US')
    let raf = 0
    const t0 = performance.now() + COUNT_DELAY
    const frame = (now: number) => {
      const k = ease(Math.min(1, Math.max(0, (now - t0) / COUNT_MS)))
      const n = Math.round(TOKENS * k)
      if (tokRef.current) tokRef.current.textContent = nf.format(n)
      if (costRef.current) costRef.current.textContent = formatMoney(n * USD_PER_TOKEN, code, rate)
      if (k < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [full])
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
    const t = setTimeout(() => setPhase('gone'), 520)
    return () => clearTimeout(t)
  }, [phase])
  if (phase === 'gone') return null
  return (
    <div className={`splash film ${full ? 'full' : 'short'} ${phase}`} aria-hidden="true">
      <svg className="film-logo" viewBox="262 318 500 388" width="150" height="116">
        <g className="bar b1">
          <path d="M262 318 H704 L762 376 V406 H262 Z" />
          <rect className="corner" x="702" y="318" width="60" height="60" />
        </g>
        <rect className="bar b2" x="262" y="468" width="340" height="88" />
        <g className="bar b3">
          <rect x="262" y="618" width="180" height="88" />
          <rect className="lit" x="262" y="618" width="180" height="88" />
          <rect className="sweep" x="262" y="618" width="40" height="88" />
        </g>
      </svg>
      <div className="film-slot">
        {full && (
          <div className="film-count">
            <span className="film-num">
              <span ref={tokRef}>0</span>
              <small>tokens</small>
            </span>
            <i className="film-dot" />
            <span className="film-num cost">
              <span ref={costRef}>{formatMoney(0, displayCurrency(), 1)}</span>
            </span>
          </div>
        )}
        <span className="film-name">SuperTokenMan</span>
      </div>
      <span className="film-sub">{done ? 'Ready' : 'Starting Claude Code'}</span>
    </div>
  )
}
