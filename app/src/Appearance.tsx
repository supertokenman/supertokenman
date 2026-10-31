import { lazy, Suspense, useEffect, useState } from 'react'
import { TranscriptToggle } from './Transcript'
const ControlSettings = lazy(() => import('./control/ControlSettings'))
const RuntimeSettings = lazy(() => import('./settings/Runtime').then((x) => ({ default: x.RuntimeSettings })))
const DictationSettings = lazy(() => import('./DictationSettings').then((x) => ({ default: x.DictationSettings })))
import { IconClose } from './icons'
import { LOADERS, LoaderMark, loaderStyle, setLoaderStyle } from './Thinking'
import { TouchIdSettings } from './Lock'
import { hotkeyLabel, toAccelerator } from '../shared/hotkey'
import type { HudView } from '../../token-kit/mod/supertokenman/hooks/hud'
import { hudMini } from './hudMini'
import { AUTO, NONE, SCENES, sceneSvg } from './landscapes'
import { DEFAULT_TYPO, FONTS, type Typo } from './typography'
import { resolve, SYSTEM, themeSvg, THEMES, type Theme } from './themes'
import { ColorField, NumberField, Select, Slider, Switch } from './ui'
import type { LoopConfig } from '../shared/loopguard'

const SAMPLE: HudView = {
  ctxUsed: 34, ctxTokens: '68k', ctxWindow: '200k', five: { used: 23, resets: '23:00' }, seven: { used: 41, resets: '' },
  cacheLeft: 52, round: 7, score: 'R$4.20', saved: 'R$0.86', kos: 3, ko: null, enemies: [],
}

const Swatches = ({ t }: { t: Theme }) => (
  <span className="swatches">
    {[t.c.bg, t.c.surface, t.c.text, t.c.accent, t.c.green, t.c.red].map((c, i) => (
      <i key={i} style={{ background: c }} />
    ))}
  </span>
)

const CLAUDE_COLORS = ['text', 'muted', 'accent-glow', 'blue', 'green', 'gold']
const YOU_COLORS = ['text', 'accent', 'accent-glow', 'blue', 'green']
const BUBBLES = ['raised', 'surface', 'hover', 'accent-soft', 'sunken']

function Colors(props: { value: string; roles: string[]; onPick: (v: string) => void; label: string }) {
  const custom = /^#/.test(props.value)
  return (
    <span className="typo-swatches" role="radiogroup" aria-label={props.label}>
      {props.roles.map((r) => (
        <button key={r} role="radio" aria-checked={props.value === r} data-tip={r} aria-label={r} className={props.value === r ? 'on' : ''} style={{ background: `var(--${r})` }} onClick={() => props.onPick(r)} />
      ))}
      <ColorField data-tip="Custom color" aria-label={`${props.label}: custom`} value={custom ? props.value : '#d97757'} onChange={(e) => props.onPick(e.target.value)} className={custom ? 'on' : ''} />
    </span>
  )
}

/** Font, size, spacing and colors of the chat, with a live sample. */
function TextSettings({ typo, onChange }: { typo: Typo; onChange: (t: Typo) => void }) {
  const set = (p: Partial<Typo>) => onChange({ ...typo, ...p })
  return (
    <div className="typo">
      <div className="typo-controls">
        <label className="typo-row">Font
          <Select value={typo.font} onChange={(e) => set({ font: e.target.value })}>
            {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
          </Select>
        </label>
        <label className="typo-row">Size
          <span><Slider min={11} max={20} step={0.5} value={typo.size} onChange={(e) => set({ size: Number(e.target.value) })} /><output>{typo.size}px</output></span>
        </label>
        <label className="typo-row">Line height
          <span><Slider min={1.2} max={2.2} step={0.05} value={typo.line} onChange={(e) => set({ line: Number(e.target.value) })} /><output>{typo.line.toFixed(2)}</output></span>
        </label>
        <div className="typo-row">Claude<Colors label="Claude's text" value={typo.claudeColor} roles={CLAUDE_COLORS} onPick={(v) => set({ claudeColor: v })} /></div>
        <div className="typo-row">You<Colors label="Your text" value={typo.youColor} roles={YOU_COLORS} onPick={(v) => set({ youColor: v })} /></div>
        <div className="typo-row">Your bubble<Colors label="Your bubble" value={typo.youBubble} roles={BUBBLES} onPick={(v) => set({ youBubble: v })} /></div>
        <label className="typo-row">Code
          <Select value={typo.code} onChange={(e) => set({ code: e.target.value })}>
            {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
          </Select>
        </label>
        <div><button className="ghost small" onClick={() => onChange(DEFAULT_TYPO)}>Reset</button></div>
      </div>
      <div className="typo-sample" aria-label="Sample">
        <div className="msg user">Why is the build slower since yesterday?</div>
        <div className="msg assistant">
          The cache key changed in <code>vite.config.ts</code>, so every run rebuilds the deps. Pin <code>optimizeDeps.include</code> and it drops back to about 2 s.
        </div>
      </div>
    </div>
  )
}

type SceneSetting = { id: string; strength: number }

/** Landscapes, each previewed in the current theme at this hour. */
function Backgrounds(props: { theme: Theme; value: SceneSetting; onChange: (v: SceneSetting) => void }) {
  const hour = new Date().getHours()
  const pick = (id: string) => props.onChange({ ...props.value, id })
  return (
    <>
      <div className="scenes">
        <button className={`scene-card ${props.value.id === AUTO ? 'on' : ''}`} onClick={() => pick(AUTO)}>
          <span className="scene-thumb scene-auto">
            {SCENES.slice(0, 4).map((sc) => <span key={sc.id} dangerouslySetInnerHTML={{ __html: sceneSvg(sc, props.theme, hour, 1.6) }} />)}
          </span>
          <span className="scene-name">Every day a new place</span>
        </button>
        {SCENES.map((sc) => (
          <button key={sc.id} className={`scene-card ${props.value.id === sc.id ? 'on' : ''}`} onClick={() => pick(sc.id)} data-tip={sc.place}>
            <span className="scene-thumb" dangerouslySetInnerHTML={{ __html: sceneSvg(sc, props.theme, hour, 1.6) }} />
            <span className="scene-name">{sc.name}</span>
          </button>
        ))}
        <button className={`scene-card ${props.value.id === NONE ? 'on' : ''}`} onClick={() => pick(NONE)}>
          <span className="scene-thumb scene-none" />
          <span className="scene-name">None</span>
        </button>
      </div>
      {props.value.id !== NONE && (
        <label className="typo-row scene-strength">Strength
          <span><Slider min={0.4} max={2} step={0.1} value={props.value.strength} onChange={(e) => props.onChange({ ...props.value, strength: Number(e.target.value) })} /><output>{Math.round(props.value.strength * 100)}%</output></span>
        </label>
      )}
    </>
  )
}

/** Open at login: the app is the first thing on screen every morning. */
function LoginToggle() {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    void window.stm.openAtLogin?.().then(setOn, () => setOn(null))
  }, [])
  if (on === null) return null
  return (
    <div className="tid-row">
      <span>Open when the Mac starts</span>
      <Switch checked={on} onChange={(e) => void window.stm.openAtLogin(e.target.checked).then(setOn)} />
    </div>
  )
}

/** Check for updates on its own: off until turned on here or in the first-run question; listed on the privacy page. */
function UpdateToggle() {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    void window.stm.updateAuto?.().then(setOn, () => setOn(null))
  }, [])
  if (on === null) return null
  return (
    <div className="tid-row">
      <span>Check for updates automatically</span>
      <Switch checked={on} onChange={(e) => void window.stm.updateAuto(e.target.checked).then(setOn)} />
    </div>
  )
}

/** Claude Code's own usage data and error reports to Anthropic: off unless turned on here. */
function ClaudeUsageToggle() {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    void window.stm.claudeUsageData?.().then(setOn, () => setOn(null))
  }, [])
  if (on === null) return null
  return (
    <div className="tid-row" data-tip="Claude Code's telemetry, error reports and other non-essential calls. Messages to Claude always go to Anthropic. Applies to panels opened after the change.">
      <span>Let Claude Code send usage data to Anthropic</span>
      <Switch checked={on} onChange={(e) => void window.stm.claudeUsageData(e.target.checked).then(setOn)} />
    </div>
  )
}

/** Loop detection: on by default (it only pauses a turn, nothing is sent anywhere); thresholds editable. */
function LoopGuardSettings() {
  const [c, setC] = useState<LoopConfig | null>(null)
  useEffect(() => {
    void window.stm.loopSettings?.().then(setC, () => setC(null))
  }, [])
  if (!c) return null
  const save = (next: Partial<LoopConfig>) => void window.stm.loopSettings(next).then(setC)
  const num = (k: 'repeats' | 'window' | 'errors', label: string, min: number, max: number) => (
    <div className="tid-row">
      <span>{label}</span>
      <NumberField min={min} max={max} value={c[k]} disabled={!c.on} aria-label={label} onChange={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v) && v >= min && v <= max) save({ [k]: v })
      }} />
    </div>
  )
  return (
    <>
      <div className="tid-row" data-tip="When a panel's agent repeats the same tool call or hits the same error, the turn is stopped like Stop and the panel says what the repeats cost. Nothing is sent anywhere.">
        <span>Pause an agent that goes in circles</span>
        <Switch checked={c.on} onChange={(e) => save({ on: e.target.checked })} />
      </div>
      {num('repeats', 'Same call this many times', 2, 20)}
      {num('window', '...within the last this many calls', 2, 40)}
      {num('errors', 'Same error this many times in a row', 2, 20)}
    </>
  )
}

/** Pick a theme, each previewed with the real HUD in its colors. */
export function Appearance(props: { current: string; onPick: (id: string) => void; typo: Typo; onTypo: (t: Typo) => void; scene: SceneSetting; onScene: (v: SceneSetting) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  const options = [{ id: SYSTEM, name: 'System', theme: resolve(SYSTEM, prefersDark) }, ...THEMES.map((t) => ({ id: t.id, name: t.name, theme: t }))]

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet appearance" role="dialog" aria-label="Appearance">
        <header className="sheet-head">
          <div className="sheet-title">Appearance</div>
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body">
          <div className="section-title">Text</div>
          <TextSettings typo={props.typo} onChange={props.onTypo} />
          <div className="touchid">
            <LoginToggle />
            <UpdateToggle />
            <ClaudeUsageToggle />
            <LoopGuardSettings />
            <Suspense fallback={null}>
              <RuntimeSettings />
              <ControlSettings />
            </Suspense>
            <TranscriptToggle />
            <Suspense fallback={null}>
              <DictationSettings />
            </Suspense>
            <TouchIdSettings />
          </div>
          <div className="touchid">
            <HotkeySetting />
          </div>
          <div className="section-title">While Claude works</div>
          <LoaderPicker />
          <div className="section-title">Background</div>
          <Backgrounds theme={resolve(props.current, prefersDark)} value={props.scene} onChange={props.onScene} />
          <div className="section-title">Theme</div>
          <div className="themes">
            {options.map((o) => (
              <button key={o.id} className={`theme-card ${props.current === o.id ? 'on' : ''}`} onClick={() => props.onPick(o.id)} style={{ background: o.theme.c.bg, color: o.theme.c.text }}>
                <span className="theme-preview" dangerouslySetInnerHTML={{ __html: themeSvg(hudMini(SAMPLE), o.theme) }} />
                <span className="theme-foot">
                  <span className="theme-name">{o.name}</span>
                  {o.id === SYSTEM && <span className="theme-note" style={{ color: o.theme.c.muted }}>follows macOS</span>}
                  <Swatches t={o.theme} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The motion a panel shows while Claude works; Auto changes it with what Claude is doing. */
function LoaderPicker() {
  const [v, setV] = useState(loaderStyle)
  return (
    <div className="loaders" role="radiogroup" aria-label="Loader">
      {LOADERS.map((l) => (
        <button key={l.id} role="radio" aria-checked={v === l.id} className={`loader-card ${v === l.id ? 'on' : ''}`} onClick={() => (setLoaderStyle(l.id), setV(l.id))}>
          <span className="loader-show">
            {l.id === 'auto' ? <><LoaderMark style="scan" /><LoaderMark style="bars" /><LoaderMark style="orbit" /></> : <LoaderMark style={l.id} />}
          </span>
          <span className="loader-name">{l.name}</span>
          <span className="loader-note">{l.id === 'auto' ? 'follows what Claude is doing' : l.id === 'bars' ? 'running a command' : l.id === 'orbit' ? 'thinking' : l.id === 'pulse' ? 'editing' : 'reading and searching'}</span>
        </button>
      ))}
    </div>
  )
}

/** The quick search shortcut, recorded by pressing it. */
function HotkeySetting() {
  const [hk, setHk] = useState<{ accel: string; active: boolean } | null>(null)
  const [rec, setRec] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    void window.stm.hotkey.get().then(setHk)
  }, [])
  if (!hk) return null
  return (
    <>
      <div className="tid-row">
        <span>Quick search from any app</span>
        <button
          className={`hk-key ${rec ? 'rec' : ''}`}
          onClick={() => (setErr(''), setRec(true))}
          onBlur={() => setRec(false)}
          onKeyDown={async (e) => {
            if (!rec) return
            e.preventDefault()
            if (e.key === 'Escape') return setRec(false)
            const accel = toAccelerator(e)
            if (!accel) return
            setRec(false)
            try {
              setHk(await window.stm.hotkey.set(accel))
            } catch (x) {
              setErr(x instanceof Error ? x.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(x))
            }
          }}
        >
          {rec ? 'Press the keys...' : hotkeyLabel(hk.accel)}
        </button>
      </div>
      {!hk.active && !err && <div className="notice">This shortcut is taken by another app; click it to pick another.</div>}
      {err && <div className="notice error">{err}</div>}
    </>
  )
}
