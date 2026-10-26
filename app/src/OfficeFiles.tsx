import { useEffect, useState } from 'react'
import { IconClose } from './icons'

type Status = Awaited<ReturnType<typeof window.stm.office.status>>

/** Phase 99: Word, Excel and PowerPoint files panels built with OfficeCLI, each with its checks and preview. */
export function OfficeFiles(props: { onClose: () => void }) {
  const [st, setSt] = useState<Status | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [img, setImg] = useState<string | null>(null)
  useEffect(() => void window.stm.office.status().then((s) => (setSt(s), setSel(s.built.at(-1)?.file ?? null))), [])
  useEffect(() => void (sel ? window.stm.office.preview(sel).then(setImg) : setImg(null)), [sel])
  const cur = st?.built.filter((b) => b.file === sel).at(-1)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe of" role="dialog" aria-label="Office files">
        <header className="sheet-head">
          <div className="sheet-title">Office files</div>
          <span className="faint">{st?.found.ok ? `OfficeCLI ${st.found.version}` : 'made by panels with OfficeCLI'}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        {!st ? null : !st.found.ok ? (
          <div className="of-empty">
            <p>{st.found.why ?? 'OfficeCLI is not installed.'}</p>
            <p className="faint">OfficeCLI (Apache-2.0) is a separate program that makes .docx, .xlsx and .pptx files. Install it yourself from its releases page; the app does not download it or run its installer. Once it is on the PATH, panels get a tool to build these files, and each one shows here with its checks and a preview.</p>
            <code className="of-link">{st.found.releases}</code>
          </div>
        ) : (
          <div className="of-body">
            <aside className="of-list">
              {!st.built.length && <div className="faint">Nothing built yet. Ask a panel for a Word, Excel or PowerPoint file.</div>}
              {[...new Map(st.built.map((b) => [b.file, b])).values()].reverse().map((b) => (
                <button key={b.file} className={`ib-filter ${b.file === sel ? 'on' : ''}`} onClick={() => setSel(b.file)}>
                  <b>{b.rel}</b><span className="faint">{b.panel} · {new Date(b.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              ))}
            </aside>
            {cur && (
              <main className="of-main">
                <div className="of-checks">
                  <span className={`ds-grade ${cur.ok && cur.valid !== false ? 'ok' : 'bad'}`}>{!cur.ok ? 'NOT BUILT' : cur.valid === false ? 'INVALID' : cur.valid ? 'VALID' : 'NOT CHECKED'}</span>
                  <span className="faint">{cur.commands} commands · {cur.ms} ms{cur.hash ? ` · sha256 ${cur.hash}` : ''}</span>
                  <span className="spacer-flex" />
                  {cur.ok && <button className="ghost small" onClick={() => void window.stm.office.reveal(cur.file)}>Show in folder</button>}
                </div>
                {cur.error && <div className="bg-err">{cur.error}</div>}
                {cur.ok && <div className="of-issues">{cur.issues.length ? cur.issues.map((i) => <div key={i}>{i}</div>) : <span className="faint">No issues reported.</span>}</div>}
                {img ? <img className="of-shot" src={img} alt={`Preview of ${cur.rel}`} /> : cur.ok && <div className="faint">No preview.</div>}
                <div className="faint">Nothing is sent anywhere. To share the file, attach it yourself.</div>
              </main>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
