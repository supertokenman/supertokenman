import { useEffect, useState } from 'react'
import { search, type Photo } from '../shared/photos'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { IconClose, IconFolder, IconRefresh } from './icons'
import './bridge'
import { DateField } from './ui'

const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

/** One thumbnail, loaded when it scrolls into view. */
function Thumb(props: { p: Photo; onOpen: () => void }) {
  const [src, setSrc] = useState('')
  const [el, setEl] = useState<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        io.disconnect()
        void window.stm.photos.thumb(props.p.source, props.p.id).then(setSrc)
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [el])
  return (
    <button ref={setEl} className="ph-cell" onClick={props.onOpen} data-tip={`${props.p.name} · ${props.p.taken.replace('T', ' ')}${props.p.camera ? ` · ${props.p.camera}` : ''}`}>
      {src ? <img src={src} alt={props.p.name} /> : <i />}
      <span>{props.p.taken.slice(0, 10)}</span>
    </button>
  )
}

/**
 * Photos: a folder on this Mac or your own Immich, searched here by name, folder, date and camera.
 * Only the date taken and the camera are read from the files; location and faces never are.
 */
export function PhotosSheet(props: { onClose: () => void }) {
  const [src, setSrc] = useState<'folder' | 'immich'>('folder')
  const [cfg, setCfg] = useState<{ dir: string; immich: string; immichKey: boolean } | null>(null)
  const [all, setAll] = useState<Photo[] | null>(null)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  useEffect(() => void window.stm.photos.get().then((c) => (setCfg(c), setUrl(c.immich))), [])
  const scan = () => (setBusy(true), setErr(''), void window.stm.photos.scan().then(setAll, (e) => setErr(clean(e))).finally(() => setBusy(false)))
  useEffect(() => {
    if (src === 'folder' && cfg?.dir) scan()
    if (src === 'immich') setAll(null)
  }, [src, cfg?.dir])
  const immichSearch = () => (setBusy(true), setErr(''), void window.stm.photos.immich(q).then(setAll, (e) => setErr(clean(e))).finally(() => setBusy(false)))
  const shown = all ? (src === 'folder' ? search(all, q, from || undefined, to || undefined) : all) : []
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe phx" role="dialog" aria-label="Photos">
        <header className="sheet-head">
          <div className="sheet-title">Photos</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={src === 'folder'} onClick={() => setSrc('folder')}>Folder</button>
            <button role="tab" aria-selected={src === 'immich'} onClick={() => setSrc('immich')}>Immich</button>
          </div>
          <span className="faint">{all ? `${shown.length.toLocaleString()} of ${all.length.toLocaleString()}` : ''}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ar-pad">
          {src === 'folder' ? (
            <div className="ob-row">
              <button className="small" onClick={() => void window.stm.photos.pick().then((d) => setCfg((c) => (c ? { ...c, dir: d } : c)))}><IconFolder />{cfg?.dir ? 'Change folder' : 'Pick a folder'}</button>
              <span className="faint ob-grow">{cfg?.dir || 'No folder yet.'}</span>
              {cfg?.dir && <button className="ghost small" disabled={busy} onClick={scan}><IconRefresh />Read again</button>}
            </div>
          ) : (
            <div className="fld-grid">
              <label className="fld"><span className="fld-label">Your Immich</span><input value={url} placeholder="https://photos.home.lan" onChange={(e) => setUrl(e.target.value)} /></label>
              <label className="fld"><span className="fld-label">API key</span><input type="password" value={key} placeholder={cfg?.immichKey ? 'kept in the vault' : 'Account settings, API keys'} onChange={(e) => setKey(e.target.value)} /></label>
              <div className="fld"><span className="fld-label">&nbsp;</span><button className="small" onClick={() => void window.stm.photos.immichSet(url, key).then(() => (setKey(''), window.stm.photos.get().then(setCfg)), (e) => setErr(clean(e)))}>Save</button></div>
            </div>
          )}
          <div className="ob-row">
            <input className="ob-grow" value={q} placeholder={src === 'immich' ? 'Describe what is in the photo (Immich smart search, on your server)' : 'Name, folder, camera or month (2026-10)'} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && src === 'immich' && immichSearch()} />
            {src === 'folder' ? (
              <>
                <DateField value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
                <DateField value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
              </>
            ) : <button className="primary small" disabled={busy || !cfg?.immich} onClick={immichSearch}>Search</button>}
          </div>
          {busy && <div className="faint"><StateMark state="busy" label="Reading" /> Reading…</div>}
          {err && <div className="notice error">{err}</div>}
          <div className="ph-grid">
            {shown.slice(0, 600).map((p) => <Thumb key={`${p.source}:${p.id}`} p={p} onOpen={() => (p.source === 'folder' ? void window.stm.photos.open(p.id) : cfg?.immich && void window.stm.openUrl(`${cfg.immich}/photos/${p.id}`))} />)}
          </div>
          {shown.length > 600 && <div className="faint">First 600 shown; narrow the search.</div>}
          <div className="faint">{src === 'folder' ? `Only the date taken and the camera are read from each file (${all ? kb(all.reduce((n, p) => n + p.size, 0)) : '0 KB'} indexed); location is never read and faces are never detected.` : 'Immich runs its own search on your server; this app does not use its face groups.'}</div>
        </div>
      </div>
    </div>
  )
}
