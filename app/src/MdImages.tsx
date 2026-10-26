import { useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import type { Template } from '../shared/mdimages'

type Scan = Awaited<ReturnType<typeof window.stm.mdImages.scan>>
type Result = Awaited<ReturnType<typeof window.stm.mdImages.publish>>
const kb = (n: number) => (n < 0 ? 'missing' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** Phase 101: the local images of one Markdown file; nothing leaves this machine until picked and confirmed. */
export function MdImages(props: { onClose: () => void }) {
  const [scan, setScan] = useState<Scan | null>(null)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [tpl, setTpl] = useState<Template>('markdown')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState('')
  const open = () => void window.stm.mdImages.pick().then((f) => void (f && window.stm.mdImages.scan(f).then((s) => (setScan(s), setPick(new Set()), setRes(null)))), (e) => setErr(clean(e)))
  const publish = () => {
    if (!scan) return
    setBusy(true)
    void window.stm.mdImages.publish(scan.file, [...pick], tpl).then((r) => (setRes(r), setConfirm(false), window.stm.mdImages.scan(scan.file).then(setScan)), (e) => setErr(clean(e))).finally(() => setBusy(false))
  }
  const total = scan?.images.filter((i) => pick.has(i.ref)).reduce((a, i) => a + Math.max(0, i.bytes), 0) ?? 0
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe mi-sheet" role="dialog" aria-label="Publish images">
        <header className="sheet-head">
          <div className="sheet-title">Publish images</div>
          <span className="faint">{scan ? scan.file : 'images a Markdown file keeps on this machine'}</span>
          <span className="spacer-flex" />
          <button className="ghost small" onClick={open}>{scan ? 'Other file…' : 'Pick a Markdown file…'}</button>
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="mi-body">
          {err && <div className="bg-err">{err}</div>}
          {!scan ? <div className="faint">Pick a .md file. Its local images are listed with a preview; only the ones you tick go to your bucket, and the file's links are rewritten to them.</div>
            : !scan.images.length ? <div className="faint">No local images in this file{res?.changed ? ' any more: all links point online now.' : '.'}</div>
            : (
              <>
                {!scan.storage && <div className="bg-err">Storage is not set up. Set the bucket, its public link and keys in Storage first.</div>}
                <div className="mi-grid">
                  {scan.images.map((i) => (
                    <label key={i.ref} className={`mi-card ${pick.has(i.ref) ? 'on' : ''} ${i.bytes < 0 ? 'missing' : ''}`}>
                      {i.preview ? <img src={i.preview} alt={i.alt || i.ref} /> : <div className="mi-none">{i.bytes < 0 ? 'File not found' : 'No preview'}</div>}
                      <span className="mi-meta"><input type="checkbox" disabled={i.bytes < 0} checked={pick.has(i.ref)} onChange={(e) => setPick((p) => { const n = new Set(p); if (e.target.checked) n.add(i.ref); else n.delete(i.ref); return n })} /><code>{i.ref}</code></span>
                      <span className="faint">line {i.line} · {kb(i.bytes)}</span>
                    </label>
                  ))}
                </div>
                <div className="ob-row">
                  <label className="chart-name" htmlFor="mi-tpl">Links as</label>
                  <select id="mi-tpl" value={tpl} onChange={(e) => setTpl(e.target.value as Template)}>
                    <option value="markdown">Markdown image</option>
                    <option value="html">HTML img</option>
                    <option value="url">Bare URL</option>
                  </select>
                  <span className="spacer-flex" />
                  {confirm ? (
                    <>
                      <span className="mi-warn">Upload {pick.size} image{pick.size === 1 ? '' : 's'} ({kb(total)}) to your bucket? Anyone with the link can see them.</span>
                      <button onClick={() => setConfirm(false)}>Cancel</button>
                      <button className="primary" disabled={busy} onClick={publish}>{busy ? 'Uploading…' : 'Upload'}</button>
                    </>
                  ) : <button className="primary" disabled={!pick.size || !scan.storage} onClick={() => setConfirm(true)}>Publish {pick.size || ''} selected</button>}
                </div>
              </>
            )}
          {res && (
            <div className="mi-res">
              {res.published.map((p) => <div key={p.ref}><code>{p.ref}</code> → <code>{p.url}</code></div>)}
              {res.errors.map((e) => <div key={e.ref} className="bg-err"><code>{e.ref}</code>: {e.error}</div>)}
              <div className="faint">{res.changed} link{res.changed === 1 ? '' : 's'} rewritten in the file.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
