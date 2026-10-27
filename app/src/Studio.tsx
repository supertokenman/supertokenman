import { useEffect, useMemo, useRef, useState } from 'react'
import { IconClose } from './icons'
import { contrast, exportAs, extract, grade, harmony, HARMONIES, inkOn, themeFrom, type Harmony } from './colorKit'
import { DESIGN_SYSTEMS, PALETTES, search } from './paletteLibrary'
import type { Theme } from './themes'
import { KITS, kitCss, kitPrompt, searchKits } from './designKits'
import { KitPreview } from './KitPreview'
import { ColorField } from './ui'
import { pickFile } from './FilePicker'

type Tab = 'kits' | 'generate' | 'library' | 'image' | 'systems'
const TABS: [Tab, string][] = [
  ['kits', 'Kits'],
  ['generate', 'Generate'],
  ['library', 'Library'],
  ['image', 'From image'],
  ['systems', 'Design systems'],
]
const randomSeed = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`

/** The palette studio: make a palette, find one, take one from an image, study design systems; copy it as code or wear it as the app's theme. */
export function Studio(props: { onClose: () => void; onApply: (t: Theme) => void; onBuild: (prompt: string) => void }) {
  const [tab, setTab] = useState<Tab>('kits')
  const [kitId, setKitId] = useState(KITS[0]!.id)
  const [kitAccent, setKitAccent] = useState<string | undefined>()
  const [seed, setSeed] = useState('#d97757')
  const [mode, setMode] = useState<Harmony>('analogous')
  const [palette, setPalette] = useState<string[]>(() => harmony('#d97757', 'analogous'))
  const [name, setName] = useState('My palette')
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState('')
  const [imgErr, setImgErr] = useState('')

  useEffect(() => {
    if (tab === 'generate') setPalette(harmony(/^#[0-9a-f]{6}$/i.test(seed) ? seed : '#d97757', mode))
  }, [seed, mode, tab])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(''), 1400)
  }
  const fromImage = (f: File) => {
    setImgErr('')
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const k = Math.min(1, 200 / Math.max(img.width, img.height))
      c.width = Math.max(1, Math.round(img.width * k))
      c.height = Math.max(1, Math.round(img.height * k))
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0, c.width, c.height)
      const colors = extract(g.getImageData(0, 0, c.width, c.height).data, 6)
      URL.revokeObjectURL(url)
      if (colors.length) {
        setPalette(colors.slice(0, 6))
        setName(f.name.replace(/\.[^.]+$/, ''))
      } else setImgErr('No colors found in that image.')
    }
    img.onerror = () => setImgErr('That file is not an image the app can read.')
    img.src = url
  }
  const lib = useMemo(() => search(PALETTES, q), [q])
  const kits = useMemo(() => searchKits(q), [q])
  const kit = KITS.find((k) => k.id === kitId) ?? KITS[0]!
  const systems = useMemo(() => search(DESIGN_SYSTEMS, q, (d) => `${d.by} ${d.what}`), [q])
  const light = useMemo(() => themeFrom(palette, 'light', name), [palette, name])
  const dark = useMemo(() => themeFrom(palette, 'dark', name), [palette, name])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet studio" role="dialog" aria-label="Design studio">
        <header className="sheet-head">
          <div className="sheet-title">Design studio</div>
          <div className="segmented">
            {TABS.map(([id, label]) => (
              <button key={id} aria-selected={tab === id} onClick={() => (setTab(id), setQ(''))}>
                {label}
              </button>
            ))}
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body studio-body">
          {tab === 'generate' && (
            <div className="st-gen">
              <label className="st-seed" data-tip="Pick the seed color" role="img" aria-label="Pick the seed color">
                <ColorField value={seed} onChange={(e) => setSeed(e.target.value)} />
                <span style={{ background: seed }} />
              </label>
              <input className="st-hex" value={seed} onChange={(e) => setSeed(e.target.value.trim())} spellCheck={false} aria-label="Seed color" />
              <div className="segmented">
                {HARMONIES.map((m) => (
                  <button key={m} aria-selected={mode === m} onClick={() => setMode(m)}>
                    {m[0]!.toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
              <button className="ghost small" onClick={() => setSeed(randomSeed())}>Surprise me</button>
            </div>
          )}
          {tab === 'kits' && (
            <div className="st-kits">
              <div className="st-kit-list">
                <input className="int-find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="saas, finance, dark, kids..." spellCheck={false} />
                {kits.map((k) => (
                  <button key={k.id} className={`st-kit ${k.id === kitId ? 'on' : ''}`} onClick={() => (setKitId(k.id), setKitAccent(undefined))}>
                    <span className="st-kit-sw" style={{ background: k.t.bg, borderColor: k.t.border, borderRadius: Math.min(k.t.radius, 10) }}>
                      <span style={{ background: k.t.accent, borderRadius: Math.min(k.t.radius, 6) }} />
                      <span style={{ background: k.t.accent2, borderRadius: Math.min(k.t.radius, 6) }} />
                    </span>
                    <span className="st-kit-text">
                      <span className="st-kit-name">{k.name}</span>
                      <span className="st-kit-mood">{k.mood}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="st-kit-main">
                <div className="st-kit-scroll">
                  <KitPreview kit={kit} accent={kitAccent} />
                </div>
                <div className="st-foot">
                  <div className="st-export">
                    <span className="faint">Accent</span>
                    {[kit.t.accent, ...palette.slice(0, 5)].map((c, i) => (
                      <button key={i} className={`st-acc ${(kitAccent ?? kit.t.accent) === c ? 'on' : ''}`} style={{ background: c }} aria-label={i ? `Use ${c} from the palette` : 'The kit’s own accent'} data-tip={i ? `${c}, from your palette` : 'The kit’s own'} onClick={() => setKitAccent(i ? c : undefined)} />
                    ))}
                  </div>
                  <div className="st-export">
                    <button className="ghost small" onClick={() => copy(kitCss(kitAccent ? { ...kit, t: { ...kit.t, accent: kitAccent } } : kit), 'tokens')}>{copied === 'tokens' ? 'Copied' : 'Copy tokens'}</button>
                    <button className="ghost small" onClick={() => copy(kitPrompt(kit, kitAccent), 'prompt')}>{copied === 'prompt' ? 'Copied' : 'Copy brief'}</button>
                    <button className="primary small" onClick={() => props.onBuild(kitPrompt(kit, kitAccent))}>Build in project</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {(tab === 'library' || tab === 'systems') && (
            <input className="int-find" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'library' ? `Search ${PALETTES.length} palettes: praia, retro, fintech, calm...` : `Search ${DESIGN_SYSTEMS.length} design systems: tokens, react, accessibility...`} spellCheck={false} autoFocus />
          )}
          {tab === 'library' && (
            <div className="st-lib">
              {lib.map((p) => (
                <button key={p.name} className={`st-card ${p.colors.join() === palette.join() ? 'on' : ''}`} onClick={() => (setPalette(p.colors), setName(p.name))}>
                  <span className="st-strip">{p.colors.map((c) => <span key={c} style={{ background: c }} />)}</span>
                  <span className="st-card-name">{p.name}</span>
                  <span className="st-card-tags">{p.tags.slice(0, 3).join(' · ')}</span>
                </button>
              ))}
              {!lib.length && <div className="faint pad">No palette matches. Try a mood (calmo, vibrante) or a use (fintech, comida).</div>}
            </div>
          )}
          {tab === 'image' && (
            <div
              className="st-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (f) fromImage(f)
              }}
              onClick={() => void pickFile({ title: 'An image', accept: ['png', 'jpg', 'jpeg', 'webp', 'gif'], action: 'Use' }).then((f) => f && fromImage(f))}
            >
              <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><rect x="4" y="8" width="36" height="28" rx="3" className="se-b" /><circle cx="15" cy="18" r="4" className="se-a" /><path d="M8 32l10-9 7 6 5-4 10 7" className="se-line" /></svg>
              <div className="se-title">Drop a screenshot, a photo or a logo</div>
              <div className="se-text">Its main colors become the palette. The image stays on this Mac.</div>
              {imgErr && <div className="notice error">{imgErr}</div>}
            </div>
          )}
          {tab === 'systems' && (
            <div className="st-sys">
              {systems.map((d) => (
                <div key={d.name} className="st-sys-row">
                  <div className="st-sys-main">
                    <div className="st-sys-top">
                      <span className="st-sys-name">{d.name}</span>
                      <span className="faint">{d.by}</span>
                    </div>
                    <div className="st-sys-what">{d.what}</div>
                    <div className="pcard-ints">{d.tags.map((t) => <span key={t} className="pcard-int">{t}</span>)}</div>
                  </div>
                  <button className="ghost small" onClick={() => void window.stm.setupOpen(d.url)}>Open</button>
                </div>
              ))}
            </div>
          )}

          {tab !== 'systems' && tab !== 'kits' && (
            <>
              <div className="st-swatches">
                {palette.map((c, i) => {
                  const w = contrast(c, '#ffffff')
                  const b = contrast(c, '#141413')
                  return (
                    <button key={i} className="st-swatch" style={{ background: c, color: inkOn(c) }} onClick={() => copy(c, c)} data-tip="Copy">
                      <span className="st-hexl">{copied === c ? 'Copied' : c}</span>
                      <span className="st-aa">
                        <span style={{ color: '#fff' }}>Aa {grade(w)}</span>
                        <span style={{ color: '#141413' }}>Aa {grade(b)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="st-foot">
                <div className="st-export">
                  <span className="faint">Copy as</span>
                  {(['css', 'tailwind', 'json'] as const).map((k) => (
                    <button key={k} className="ghost small" onClick={() => copy(exportAs(palette, k), k)}>
                      {copied === k ? 'Copied' : k === 'css' ? 'CSS variables' : k === 'tailwind' ? 'Tailwind' : 'Design tokens'}
                    </button>
                  ))}
                </div>
                <div className="st-apply">
                  {[light, dark].map((t) => (
                    <button key={t.scheme} className="st-preview" onClick={() => props.onApply(t)} data-tip={`Wear it as the app's ${t.scheme} theme`} style={{ background: t.c.bg, color: t.c.text, borderColor: t.c.raised }}>
                      <span className="st-pv-bar" style={{ background: t.c.surface }}>
                        <span style={{ background: t.c.accent }} />
                        <span style={{ background: t.c.faint }} />
                      </span>
                      <span className="st-pv-text">Use as {t.scheme} theme</span>
                      <span className="st-pv-btn" style={{ background: t.c.accent, color: t.c.onAccent }}>Aa</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
