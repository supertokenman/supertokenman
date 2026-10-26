import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'

type Cfg = Awaited<ReturnType<typeof window.stm.pdfTools.config>>
type Op = Cfg['ops'][number]['id']
type Found = Awaited<ReturnType<typeof window.stm.pdfTools.scan>>
const KIND: Record<string, string> = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Phone', card: 'Card' }

/** Phase 105: merge, split, compress, OCR, remove pages and redact, through the person's own Stirling-PDF. */
export function PdfTools(props: { onClose: () => void }) {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [url, setUrl] = useState('')
  const [files, setFiles] = useState<{ file: string; bytes: number }[]>([])
  const [op, setOp] = useState<Op>('redact')
  const [pages, setPages] = useState('')
  const [level, setLevel] = useState(5)
  const [langs, setLangs] = useState('eng, por')
  const [found, setFound] = useState<Found | null>(null)
  const [pick, setPick] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState('')
  const [out, setOut] = useState<{ file: string; bytes: number }[]>([])
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.pdfTools.config().then((c) => (setCfg(c), setUrl(c.url))), [])
  const many = cfg?.ops.find((o) => o.id === op)?.many
  const scan = (f: string) => (setBusy('Reading'), void window.stm.pdfTools.scan(f).then((r) => (setFound(r), setPick(new Set(r.map((x) => x.i)))), (e) => setErr(clean(e))).finally(() => setBusy('')))
  const add = () => void window.stm.pdfTools.pick().then((fs) => {
    const next = [...files, ...fs.filter((f) => !files.some((x) => x.file === f.file))]
    setFiles(next)
    if (op === 'redact' && next[0]) scan(next[0].file)
  })
  const run = () => {
    setErr('')
    setBusy('Working')
    void window.stm.pdfTools.run(op, many ? files.map((f) => f.file) : files.slice(0, 1).map((f) => f.file), { pages, level, languages: langs.split(',').map((l) => l.trim()).filter(Boolean), pick: [...pick] })
      .then((r) => setOut((o) => [r, ...o]), (e) => setErr(clean(e))).finally(() => setBusy(''))
  }
  const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe pt" role="dialog" aria-label="PDF tools">
        <header className="sheet-head">
          <div className="sheet-title">PDF tools</div>
          <span className="faint">through your Stirling-PDF; files go to that address only</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="pt-body">
          <div className="pt-row">
            <label className="chart-name" htmlFor="pt-url">Stirling-PDF</label>
            <input id="pt-url" value={url} placeholder="http://localhost:8080" spellCheck={false} onChange={(e) => setUrl(e.target.value)} onBlur={() => void window.stm.pdfTools.config(url).then(setCfg, (e) => setErr(clean(e)))} />
            <span className="faint">{cfg?.hasKey ? 'API key from the vault (STIRLING_API_KEY)' : 'No API key in the vault: fine if your server does not ask for one'}</span>
          </div>
          <div className="segmented pt-ops" role="tablist">
            {cfg?.ops.map((o) => <button key={o.id} role="tab" aria-selected={op === o.id} onClick={() => (setOp(o.id), o.id === 'redact' && files[0] && !found && scan(files[0].file))}>{o.name}</button>)}
          </div>
          <div className="pt-files">
            {files.map((f, i) => (
              <div key={f.file} className={`pt-file ${!many && i > 0 ? 'off' : ''}`}><code>{f.file}</code><span className="faint">{kb(f.bytes)}</span><button className="icon" aria-label="Remove" onClick={() => (setFiles(files.filter((x) => x.file !== f.file)), i === 0 && setFound(null))}><IconClose /></button></div>
            ))}
            <button className="ghost small" onClick={add}>Add PDFs…</button>
            {!many && files.length > 1 && <div className="faint">{cfg?.ops.find((o) => o.id === op)?.name} works on the first file.</div>}
          </div>
          {(op === 'split' || op === 'remove') && <div className="pt-row"><label className="chart-name" htmlFor="pt-pages">Pages</label><input id="pt-pages" value={pages} placeholder="1,3,5-7" onChange={(e) => setPages(e.target.value)} /></div>}
          {op === 'compress' && <div className="pt-row"><label className="chart-name" htmlFor="pt-level">Level {level}</label><input id="pt-level" type="range" min={1} max={9} value={level} onChange={(e) => setLevel(Number(e.target.value))} /></div>}
          {op === 'ocr' && <div className="pt-row"><label className="chart-name" htmlFor="pt-langs">Languages</label><input id="pt-langs" value={langs} onChange={(e) => setLangs(e.target.value)} /></div>}
          {op === 'redact' && (
            <div className="pt-redact">
              <div className="faint">Personal data found in the first file, to cover before it goes to Claude or anyone else. Each page becomes an image so the text cannot be copied back.</div>
              {busy === 'Reading' ? <div className="faint">Reading…</div> : found && !found.length ? <div className="faint">Nothing found. Read it anyway: a scan finds patterns, not every name.</div> : found?.map((f) => (
                <label key={f.i} className="ca-toggle"><input type="checkbox" checked={pick.has(f.i)} onChange={(e) => setPick((p) => { const n = new Set(p); if (e.target.checked) n.add(f.i); else n.delete(f.i); return n })} /><span className="pt-kind">{KIND[f.kind] ?? f.kind}</span><code>{f.shown}</code></label>
              ))}
            </div>
          )}
          {err && <div className="bg-err">{err}</div>}
          <div className="ob-row">
            <span className="spacer-flex" />
            <button className="primary" disabled={!!busy || !files.length || !url || (op === 'redact' && !pick.size)} onClick={run}>{busy === 'Working' ? 'Working…' : `${cfg?.ops.find((o) => o.id === op)?.name ?? 'Run'}${op === 'redact' ? ` ${pick.size}` : ''}`}</button>
          </div>
          {out.map((o) => <div key={o.file} className="pt-out"><span>Saved</span><code>{o.file}</code><span className="faint">{kb(o.bytes)}</span><button className="ghost small" onClick={() => void window.stm.pdfTools.reveal(o.file)}>Show in folder</button></div>)}
        </div>
      </div>
    </div>
  )
}
