import { useEffect, useState } from 'react'
import { EmptyState } from './EmptyState'
import { IconClose } from './icons'
import { clean } from './errors'
import type { Report } from '../electron/imagexray'
import { Combobox } from './ui'

const mb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} kB` : `${n} B`)

/** Phase 115: what each layer of an image holds and how much of it is waste. */
export function ImageXray(props: { sid?: string; onClose: () => void }) {
  const [images, setImages] = useState<{ name: string; size: string }[]>([])
  const [image, setImage] = useState('')
  const [rep, setRep] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.xray.images().then((l) => (setImages(l), setImage((x) => x || l[0]?.name || ''))), [])
  const run = () => (setBusy(true), setErr(''), void window.stm.xray.run(image).then(setRep, (e) => setErr(clean(e))).finally(() => setBusy(false)))
  const ask = () => {
    if (!rep || !props.sid) return
    const top = rep.worst.slice(0, 8).map((w) => `- ${w.path}: ${mb(w.wasted)}`).join('\n')
    const layers = rep.layers.map((l, i) => `${i + 1}. ${mb(l.size)}${l.wasted ? ` (waste ${mb(l.wasted)})` : ''}: ${l.createdBy.slice(0, 160)}`).join('\n')
    void window.stm.send(props.sid, `The Docker image ${rep.image} is ${mb(rep.total)} with ${mb(rep.wasted)} wasted (${Math.round(rep.efficiency * 100)}% efficient).\n\nLayers:\n${layers}\n\nMost wasted:\n${top}\n\nRead the Dockerfile in this project and propose the smallest changes that remove the waste: join RUN steps that create and delete files, use a multi-stage build, add a .dockerignore. Show the diff; do not build or push.`).then(() => props.onClose())
  }
  const max = Math.max(1, ...(rep?.layers ?? []).map((l) => l.size))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet config observe xr ${rep ? '' : 'fit'}`} role="dialog" aria-label="Image X-ray">
        <header className="sheet-head">
          <div className="sheet-title">Image X-ray</div>
          <span className="faint">each layer of a local image, and the bytes later layers throw away</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="pt-body">
          <div className="pt-row">
            <label className="chart-name" htmlFor="xr-img">Image</label>
            <Combobox id="xr-img" options={images.map((i) => ({ value: i.name, hint: String(i.size) }))} value={image} spellCheck={false} onChange={(e) => setImage(e.target.value)} />
            <button className="primary" disabled={!image || busy} onClick={run}>{busy ? 'Reading layers…' : 'X-ray it'}</button>
          </div>
          {err && <div className="bg-err">{err}</div>}
          {rep && (
            <>
              <div className="xr-stats">
                <div><span className="xr-big">{Math.round(rep.efficiency * 100)}%</span><span className="faint">efficient</span></div>
                <div><span className="xr-big">{mb(rep.total)}</span><span className="faint">in layers</span></div>
                <div><span className={`xr-big ${rep.wasted ? 'bad' : ''}`}>{mb(rep.wasted)}</span><span className="faint">wasted</span></div>
                <span className="spacer-flex" />
                {props.sid && rep.wasted > 0 && <button onClick={ask}>Ask Claude to slim the Dockerfile</button>}
              </div>
              <table className="tbl vb-table">
                <thead><tr><th>#</th><th>Size</th><th /><th>Waste</th><th>Files</th><th>Made by</th></tr></thead>
                <tbody>
                  {rep.layers.map((l, i) => (
                    <tr key={l.id}>
                      <td className="num">{i + 1}</td>
                      <td className="num">{mb(l.size)}</td>
                      <td className="xr-barcell"><span className="xr-bar"><i style={{ width: `${(l.size / max) * 100}%` }} /><b style={{ width: `${(l.wasted / max) * 100}%` }} /></span></td>
                      <td className={`num ${l.wasted ? 'xr-bad' : 'faint'}`}>{l.wasted ? mb(l.wasted) : '-'}</td>
                      <td className="num">{l.files}</td>
                      <td><code className="xr-cmd" data-tip={l.createdBy}>{l.createdBy || '(base)'}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rep.worst.length > 0 && <><div className="sp-label">Most wasted</div>{rep.worst.slice(0, 8).map((w) => <div key={w.path} className="pt-file"><code>/{w.path}</code><span className="spacer-flex" /><span className="xr-bad">{mb(w.wasted)}</span></div>)}</>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
