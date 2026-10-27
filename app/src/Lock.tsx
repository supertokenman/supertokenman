import { useCallback, useEffect, useRef, useState } from 'react'
import type { LockPrefs } from '../electron/lock'
import { Select, Switch } from './ui'

const KeyHole = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="17" width="22" height="16" rx="3" />
    <path d="M14 17v-4a6 6 0 0 1 12 0v4" />
    <circle cx="20" cy="24" r="2" />
    <path d="M20 26v3" />
  </svg>
)

const Fingerprint = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M11 13a12 12 0 0 1 18 0" />
    <path d="M8 19a13 13 0 0 1 2-4M32 15a13 13 0 0 1 1.5 7" />
    <path d="M13 31a16 16 0 0 1-2-8 9 9 0 0 1 18 0v2" />
    <path d="M16 33a14 14 0 0 1-1.5-10 5.5 5.5 0 0 1 11 0 22 22 0 0 0 1.5 8" />
    <path d="M20 23c0 5 1.5 9 3.5 11" />
  </svg>
)

/**
 * Locks the window: when the app opens (if asked), when the screen locks or the Mac sleeps, and after
 * the chosen idle time away from the window.
 */
export function useAppLock() {
  const [state, setState] = useState<{ prefs: LockPrefs; available: boolean; touchId: boolean } | null>(null)
  const [locked, setLocked] = useState(false)
  const away = useRef(0)
  useEffect(() => {
    void window.stm.lock.get().then((s) => {
      setState(s)
      if (s.available && s.prefs.onOpen) setLocked(true)
    })
  }, [])
  const armed = Boolean(state?.available && (state.prefs.onOpen || state.prefs.idleMin > 0))
  useEffect(() => {
    if (!armed) return
    return window.stm.lock.onLock(() => setLocked(true))
  }, [armed])
  useEffect(() => {
    if (!state?.available || !state.prefs.idleMin) return
    // away: the window lost focus or was hidden; back: it got focus or was shown again
    const leave = () => (away.current = away.current || Date.now())
    const back = () => {
      if (away.current && Date.now() - away.current > state.prefs.idleMin * 60_000) setLocked(true)
      away.current = 0
    }
    const onVis = () => (document.hidden ? leave() : back())
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', leave)
    window.addEventListener('focus', back)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', leave)
      window.removeEventListener('focus', back)
    }
  }, [state])
  const unlock = useCallback(async (method?: 'auto' | 'password') => {
    if (await window.stm.lock.prompt('unlock SuperTokenMan', method)) setLocked(false)
  }, [])
  return { locked, unlock, state, setState }
}

export function LockScreen({ onUnlock, touchId }: { onUnlock: (method?: 'auto' | 'password') => void; touchId: boolean }) {
  useEffect(() => {
    onUnlock()
  }, [onUnlock])
  return (
    <div className="lock-screen" role="dialog" aria-label="Locked">
      <div className="lock-card">
        <button className="lock-finger" onClick={() => onUnlock()} aria-label={touchId ? 'Unlock with Touch ID' : 'Unlock with your Mac password'}>
          {touchId ? <Fingerprint size={44} /> : <KeyHole />}
        </button>
        <div className="lock-title">SuperTokenMan is locked</div>
        <div className="lock-sub">{touchId ? 'Touch the sensor to continue' : 'Enter your Mac password to continue'}</div>
        {touchId && (
          <button className="ghost small" onClick={() => onUnlock('password')}>
            Use password
          </button>
        )}
      </div>
    </div>
  )
}

/** The Touch ID options, in Appearance. Every change asks for the finger first. */
export function TouchIdSettings() {
  const [s, setS] = useState<{ prefs: LockPrefs; available: boolean; touchId: boolean } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    void window.stm.lock.get().then(setS)
  }, [])
  if (!s) return null
  const set = async (p: Partial<LockPrefs>) => {
    setErr('')
    try {
      const prefs = await window.stm.lock.set({ ...s.prefs, ...p })
      setS({ ...s, prefs })
    } catch (e) {
      setErr(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    }
  }
  return (
    <>
      <div className="touchid-head">
        <Fingerprint size={18} />
        <span>{s.touchId ? 'Touch ID' : 'Lock'}</span>
        <span className="faint">{!s.available ? 'Needs macOS' : s.touchId ? 'or your Mac password' : 'with your Mac password'}</span>
      </div>
      <div className="tid-row">
        <span>Ask when the app opens</span>
        <Switch disabled={!s.available} checked={s.prefs.onOpen} onChange={(e) => void set({ onOpen: e.target.checked })} />
      </div>
      <div className="tid-row">
        <span>Ask before changing secrets</span>
        <Switch disabled={!s.available} checked={s.prefs.secrets} onChange={(e) => void set({ secrets: e.target.checked })} />
      </div>
      <div className="tid-row">
        <span>Lock after time away</span>
        <Select disabled={!s.available} value={s.prefs.idleMin} onChange={(e) => void set({ idleMin: Number(e.target.value) })}>
          <option value={0}>Never</option>
          <option value={5}>5 min</option>
          <option value={15}>15 min</option>
          <option value={30}>30 min</option>
          <option value={60}>1 hour</option>
        </Select>
      </div>
      {err && <div className="notice error">{err}</div>}
    </>
  )
}
