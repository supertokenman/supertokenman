import { useEffect, useState } from 'react'
import { hotkeyLabel, toAccelerator } from '../shared/hotkey'
import type { DictationStatus } from './bridge'
import './bridge'
import { Switch } from './ui'

const clean = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Settings: Dictate anywhere. Off until turned on; says which permissions macOS will ask for. */
export function DictationSettings() {
  const [s, setS] = useState<DictationStatus | null>(null)
  const [rec, setRec] = useState(false)
  const [err, setErr] = useState('')
  const [path, setPath] = useState('')
  const dict = window.stm.dictation
  useEffect(() => {
    void dict.status().then((x) => (setS(x), setPath(x.model)), () => undefined)
    // permissions are changed in System Settings: look again when the window comes back
    const again = () => void dict.status().then(setS, () => undefined)
    window.addEventListener('focus', again)
    return () => window.removeEventListener('focus', again)
  }, [dict])
  if (!s?.supported) return null
  const act = (p: Promise<DictationStatus>) => p.then((x) => (setS(x), setErr('')), (e) => setErr(clean(e)))
  const e = s.engine
  return (
    <>
      <div className="tid-row" data-tip="Hold a shortcut anywhere on this Mac, speak, and the text is typed where the cursor is. Off by default.">
        <span>Dictate anywhere</span>
        <Switch checked={s.on} onChange={(ev) => void act(dict.enable(ev.target.checked))} />
      </div>
      {s.on && (
        <div className="dict-box">
          <div className="notice">macOS will ask for two permissions: Microphone, to hear you, and Accessibility, to paste into the app you are using. Speech is turned into text on this Mac only; nothing is sent anywhere.</div>
          <div className="tid-row">
            <span>Shortcut</span>
            <button
              className={`hk-key ${rec ? 'rec' : ''}`}
              onClick={() => (setErr(''), setRec(true))}
              onBlur={() => setRec(false)}
              onKeyDown={(ev) => {
                if (!rec) return
                ev.preventDefault()
                if (ev.key === 'Escape') return setRec(false)
                const accel = toAccelerator(ev)
                if (!accel) return
                setRec(false)
                void act(dict.shortcut(accel))
              }}
            >
              {rec ? 'Press the keys...' : hotkeyLabel(s.accel)}
            </button>
          </div>
          <div className="notice">{s.note}</div>
          {!s.active && <div className="notice error">This shortcut is not active: another app holds it, or it is the same as Quick search. Click it to pick another.</div>}
          <div className="dict-sub">Engine</div>
          {e.state === 'ready' ? (
            <div className="notice">{e.message}</div>
          ) : (
            <div className="dict-setup">
              <div className="dict-sub">Set up a local engine</div>
              <div className="notice">{e.message}</div>
              {e.steps.map((t) => (
                <div key={t} className="notice">{t}</div>
              ))}
            </div>
          )}
          <div className="tid-row">
            <input className="dict-path" value={path} spellCheck={false} placeholder="/path/to/ggml-base.bin" aria-label="Model path" onChange={(ev) => setPath(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && void act(dict.model(path))} />
            <button className="btn-ghost" onClick={() => void act(dict.model(path))}>Save</button>
          </div>
          <div className="tid-row">
            <span>Accessibility (to paste)</span>
            <span className={s.accessibility ? 'dict-ok' : 'dict-off'}>{s.accessibility ? 'Allowed' : 'Not allowed'}</span>
          </div>
          {!s.accessibility && (
            <div className="notice">
              Without it the text is only copied, and you press Cmd+V yourself. To allow it: System Settings, Privacy and Security, Accessibility, then turn on SuperTokenMan.
              <button className="btn-ghost" onClick={() => void dict.open('accessibility')}>Open Accessibility settings</button>
            </div>
          )}
          <div className="tid-row">
            <span>Microphone</span>
            <span className={s.mic === 'granted' ? 'dict-ok' : 'dict-off'}>{s.mic === 'granted' ? 'Allowed' : s.mic === 'not-determined' ? 'Not asked yet' : 'Not allowed'}</span>
          </div>
          {s.mic === 'denied' && <button className="btn-ghost" onClick={() => void dict.open('microphone')}>Open Microphone settings</button>}
          <div className="tid-row" data-tip="Off by default. When on, the transcript is rewritten into a clear prompt by your small model (or Claude when none is set) before it is inserted.">
            <span>Clean up into a clear prompt</span>
            <Switch checked={s.cleanup} onChange={(ev) => void act(dict.cleanup(ev.target.checked))} />
          </div>
          {s.cleanup && <div className="notice">Clean up is on: each transcript goes through the small-model path before it is inserted. With no local small model set, that path is Claude, through Claude Code. Turn it off to insert exactly what you said.</div>}
          {err && <div className="notice error">{err}</div>}
        </div>
      )}
    </>
  )
}
