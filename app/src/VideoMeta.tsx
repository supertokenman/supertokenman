import { useState } from 'react'
import { clock, type VideoMeta } from '../shared/videometa'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { IconCheck, IconClose, IconExternal } from './icons'
import './bridge'
import { Checkbox } from './ui'

/**
 * Video metadata: paste YouTube links, get title, channel, duration, chapters and license. Metadata only;
 * nothing is downloaded. Mark each video reviewed before it can be exported to the project.
 */
export function VideoMetaSheet(props: { cwd?: string; onClose: () => void }) {
  const [text, setText] = useState('')
  const [list, setList] = useState<VideoMeta[]>([])
  const [failed, setFailed] = useState<{ id: string; error: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [path, setPath] = useState('curadoria/videos.json')
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const fetchAll = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await window.stm.vmeta.fetch(text.split(/\s+/).filter(Boolean))
      setList((l) => [...l.filter((x) => !r.videos.some((v) => v.id === x.id)), ...r.videos])
      setFailed(r.failed)
    } catch (e) {
      setMsg({ t: clean(e), bad: true })
    }
    setBusy(false)
  }
  const n = list.filter((v) => v.revisado).length
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe vm" role="dialog" aria-label="Video metadata">
        <header className="sheet-head">
          <div className="sheet-title">Video metadata</div>
          <span className="faint">metadata only · nothing is downloaded</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ar-pad">
          <label className="fld"><span className="fld-label">YouTube links</span><textarea rows={3} value={text} placeholder="One link per line" onChange={(e) => setText(e.target.value)} /><span className="fld-help">The YouTube Data API is used first (YOUTUBE_API_KEY in the vault); yt-dlp, if installed, only reads metadata (--skip-download).</span></label>
          <div className="ob-row"><span className="spacer-flex" /><button className="primary small" disabled={!text.trim() || busy} onClick={() => void fetchAll()}>{busy ? <StateMark state="busy" label="Reading" /> : null}Read metadata</button></div>
          {failed.map((f) => <div key={f.id} className="notice error">{f.id}: {f.error}</div>)}
          {list.map((v) => (
            <section key={v.id} className={`vm-item ${v.revisado ? 'vm-ok' : ''}`}>
              <div className="ob-row">
                <b>{v.title}</b>
                <span className="spacer-flex" />
                <label className="check"><Checkbox checked={v.revisado} onChange={(e) => setList(list.map((x) => (x.id === v.id ? { ...x, revisado: e.target.checked } : x)))} /> Reviewed (revisado)</label>
              </div>
              <div className="vm-meta">
                <span>{v.channel}</span><span>{clock(v.seconds)}</span><span>{v.published.slice(0, 10)}</span>
                <span className={`ar-status ${v.license === 'creativeCommon' ? 'accepted' : 'proposed'}`}>{v.license === 'creativeCommon' ? 'CC BY' : v.license === 'youtube' ? 'Standard YouTube license' : 'license unknown'}</span>
                <span className="faint">via {v.source}</span>
                <a className="is-link" href={v.url} onClick={(e) => (e.preventDefault(), void window.stm.openUrl(v.url))}><IconExternal />Open</a>
              </div>
              {v.chapters.length > 0 && <ol className="vm-ch">{v.chapters.map((c) => <li key={c.at}><code>{clock(c.at)}</code> {c.title}</li>)}</ol>}
            </section>
          ))}
          {list.length > 0 && (
            <div className="ob-row">
              <input className="ob-grow" value={path} onChange={(e) => setPath(e.target.value)} aria-label="Export path in the project" />
              <button className="primary small" disabled={!n || !props.cwd} onClick={() => void window.stm.vmeta.exportTo(props.cwd!, path, list).then((r) => setMsg({ t: `Added ${r.added} reviewed videos to ${r.file} (${r.count} in all).` }), (e) => setMsg({ t: clean(e), bad: true }))}><IconCheck />Export {n} reviewed</button>
            </div>
          )}
          {msg && <div className={msg.bad ? 'notice error' : 'notice'}>{msg.t}</div>}
          <div className="faint">Only reviewed videos are exported. Embedding or linking is your call; respect each video's license and YouTube's terms.</div>
        </div>
      </div>
    </div>
  )
}
