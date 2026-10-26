import { useMemo, useState } from 'react'
import { IconClose } from './icons'
import { toHtml, toMarkdown, turnsOf, type ExLine } from '../shared/sessionexport'

/** Export the conversation for a pull request or an issue: credentials masked, paths shortened, nothing sent. */
export function ExportSessionSheet(props: { lines: ExLine[]; cwd: string; home: string; onClose: () => void }) {
  const n = turnsOf(props.lines).length
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(n)
  const [tools, setTools] = useState(false)
  const [fmt, setFmt] = useState<'md' | 'html'>('md')
  const [done, setDone] = useState('')
  const title = `Session in ${props.cwd.split('/').filter(Boolean).pop() ?? 'project'}`
  const r = useMemo(() => (fmt === 'md' ? toMarkdown : toHtml)(props.lines, { from: Math.max(0, from - 1), to: Math.max(0, to - 1), tools, cwd: props.cwd, home: props.home, title }), [props.lines, from, to, tools, fmt, props.cwd, props.home, title])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe md" role="dialog" aria-label="Export session">
        <header className="sheet-head">
          <div className="sheet-title">Export session</div>
          <span className="faint">{r.turns} of {n} turns{r.masked ? ` · ${r.masked} credential${r.masked === 1 ? '' : 's'} masked` : ''}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ar-pad">
          <div className="ob-row">
            <label className="se-num">From turn <input type="number" min={1} max={n} value={from} onChange={(e) => setFrom(Math.min(Number(e.target.value) || 1, to))} /></label>
            <label className="se-num">to <input type="number" min={1} max={n} value={to} onChange={(e) => setTo(Math.max(Math.min(Number(e.target.value) || n, n), from))} /></label>
            <label className="ca-toggle"><input type="checkbox" checked={tools} onChange={(e) => setTools(e.target.checked)} />Tools and commands</label>
            <span className="spacer-flex" />
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={fmt === 'md'} onClick={() => setFmt('md')}>Markdown</button>
              <button role="tab" aria-selected={fmt === 'html'} onClick={() => setFmt('html')}>HTML</button>
            </div>
          </div>
          <pre className="ex-src se-preview">{r.text}</pre>
          <div className="ob-row">
            <span className="faint ob-grow">Keys and tokens are masked and paths shortened (the project as ".", your home as "~"). Read it before you paste it.</span>
            {done && <span className="faint">{done}</span>}
            <button onClick={() => void navigator.clipboard.writeText(r.text).then(() => setDone('Copied'))}>Copy</button>
            <button className="primary" onClick={() => void window.stm.exportText(`${title.replace(/\W+/g, '-').toLowerCase()}.${fmt}`, r.text).then((f) => f && setDone(`Saved ${f.split('/').pop()}`))}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
