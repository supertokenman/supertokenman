import { useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import { designMd } from '../shared/designmd'
import { framed } from '../shared/mcpapps'
import { contrast } from './colorKit'
import { RULES } from './themeContrast'
import { THEMES } from './themes'

/** Phase 102: hand the design system to a project as DESIGN.md, and look at generated HTML safely. */
export function DesignHandoff(props: { cwd?: string; onClose: () => void }) {
  const [msg, setMsg] = useState('')
  const [exists, setExists] = useState(false)
  const [doc, setDoc] = useState<{ file: string; src: string } | null>(null)
  const text = () => designMd(THEMES.filter((t) => t.id === 'claude-paper' || t.id === 'claude-dark'), RULES, contrast)
  const write = (replace: boolean) =>
    props.cwd && void window.stm.handoff.write(props.cwd, text(), replace).then((r) => (r.exists ? (setExists(true), setMsg(`${r.file} is already there.`)) : (setExists(false), setMsg(`Wrote ${r.file}. Panels in this folder read it like any file.`))), (e) => setMsg(clean(e)))
  const open = () => void window.stm.handoff.pickHtml().then((r) => r && window.stm.insp.appDoc(framed(r.html)).then((src) => setDoc({ file: r.file, src })), (e) => setMsg(clean(e)))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe dh" role="dialog" aria-label="Design handoff">
        <header className="sheet-head">
          <div className="sheet-title">Design handoff</div>
          <span className="faint">{props.cwd ?? 'no panel open'}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="dh-body">
          <section className="dh-row">
            <div>
              <div className="sp-label">DESIGN.md</div>
              <div className="faint">Tokens of Claude Paper and Claude Dark, the contrast rules, shapes, type, icons and motion, written to the project so Claude follows them. Made from the app's own design system.</div>
            </div>
            <div className="dh-actions">
              {exists ? <><button onClick={() => (setExists(false), setMsg(''))}>Keep it</button><button className="primary" onClick={() => write(true)}>Replace it</button></> : <button className="primary" disabled={!props.cwd} onClick={() => write(false)}>Export to the project</button>}
            </div>
          </section>
          {msg && <div className="faint">{msg}</div>}
          <section className="dh-row">
            <div>
              <div className="sp-label">Preview an HTML file</div>
              <div className="faint">Shown in a frame with scripts but no access to the app, no cookies and no network.</div>
            </div>
            <div className="dh-actions"><button onClick={open}>{doc ? 'Other file…' : 'Pick an HTML file…'}</button></div>
          </section>
          {doc && (
            <div className="dh-frame">
              <div className="faint"><code>{doc.file}</code></div>
              <iframe title={`Preview of ${doc.file}`} src={doc.src} sandbox="allow-scripts" referrerPolicy="no-referrer" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
