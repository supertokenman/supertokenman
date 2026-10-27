import { useEffect, useRef, useState } from 'react'
import { EmptyState } from './EmptyState'
import { IconClose } from './icons'
import { clean } from './errors'
import { confirmText, type Act, type Service, type Stack } from '../shared/stacks'

type File = { path: string; text: string; mtime: number }

/** Phase 116: the machine's compose stacks; the file is checked by compose before it is saved, and up, stop and pull ask first. */
export function ComposeStacks(props: { onClose: () => void }) {
  const [stacks, setStacks] = useState<Stack[]>([])
  const [docker, setDocker] = useState(true)
  const [sel, setSel] = useState('')
  const [services, setServices] = useState<Service[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [fi, setFi] = useState(0)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [ask, setAsk] = useState<Act | null>(null)
  const [busy, setBusy] = useState('')
  const [logSvc, setLogSvc] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [err, setErr] = useState('')
  const logEl = useRef<HTMLPreElement>(null)
  const stack = stacks.find((s) => s.name === sel)
  const file = files[fi]
  const dirty = Boolean(file && draft !== file.text)

  const list = () => window.stm.stacks.list().then((r) => (setStacks(r.stacks), setDocker(r.docker), r.stacks), (e) => (setErr(clean(e)), [] as Stack[]))
  const open = (name: string, keepFile = false) =>
    void window.stm.stacks.open(name).then((r) => {
      setServices(r.services)
      setFiles(r.files)
      const i = keepFile ? Math.min(fi, r.files.length - 1) : 0
      setFi(i)
      setDraft(r.files[i]?.text ?? '')
    }, (e) => setErr(clean(e)))
  useEffect(() => {
    void list().then((s) => s[0] && setSel(s[0].name))
    const off = window.stm.stacks.onLog((lines) => setLogs((l) => [...l, ...lines].slice(-500)))
    return () => (off(), void window.stm.stacks.logs(null))
  }, [])
  useEffect(() => {
    if (!sel) return
    setNote(null), setAsk(null), setLogs([]), setLogSvc('')
    open(sel)
    void window.stm.stacks.logs(sel)
  }, [sel])
  useEffect(() => void (logEl.current && (logEl.current.scrollTop = logEl.current.scrollHeight)), [logs])
  const pickLog = (svc: string) => (setLogSvc(svc), setLogs([]), void window.stm.stacks.logs(sel, svc || undefined))
  const save = () => {
    if (!file) return
    setBusy('save')
    void window.stm.stacks.save(sel, file.path, draft, file.mtime).then((r) => {
      setBusy('')
      if (!r.ok) return setNote({ ok: false, text: r.error ?? 'Compose did not accept it.' })
      setFiles((fs) => fs.map((f, i) => (i === fi ? { ...f, text: draft, mtime: r.mtime ?? f.mtime } : f)))
      setNote({ ok: true, text: 'Saved. Compose read it without errors. Start the stack to apply it.' })
    }, (e) => (setBusy(''), setNote({ ok: false, text: clean(e) })))
  }
  const run = () => {
    if (!ask) return
    const a = ask
    setAsk(null), setBusy(a)
    void window.stm.stacks.act(sel, a).then((r) => {
      setBusy('')
      setNote({ ok: r.ok, text: r.ok ? `${a === 'up' ? 'Started' : a === 'stop' ? 'Stopped' : 'Pulled'}.${r.out ? `\n${r.out}` : ''}` : r.out || 'It failed.' })
      void list(), open(sel, true)
    }, (e) => (setBusy(''), setNote({ ok: false, text: clean(e) })))
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet config observe stk ${docker && stacks.length ? '' : 'fit'}`} role="dialog" aria-label="Compose stacks">
        <header className="sheet-head">
          <div className="sheet-title">Compose stacks</div>
          <span className="faint">docker compose on this machine; nothing starts or stops without your click</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        {!docker ? <EmptyState title="Docker is not answering" text="Start Docker Desktop (or the Docker engine) on this machine, then open this again." /> : !stacks.length ? <EmptyState title="No compose stacks yet" text="Any stack started with docker compose shows here, running or stopped." /> : (
          <div className="stk-body">
            <nav className="stk-list" aria-label="Stacks">
              {stacks.map((s) => (
                <button key={s.name} className={`stk-item ${s.name === sel ? 'on' : ''}`} onClick={() => setSel(s.name)}>
                  <span className={`stk-dot ${s.running ? (s.running === s.total ? 'up' : 'part') : 'down'}`} />
                  <span className="stk-name">{s.name}</span>
                  <span className="faint">{s.running}/{s.total}</span>
                </button>
              ))}
            </nav>
            {stack && (
              <div className="stk-main">
                <div className="stk-acts">
                  <span className="sp-label">{stack.status || 'no containers'}</span>
                  <span className="spacer-flex" />
                  {ask ? (
                    <>
                      <span className="mi-warn">{confirmText(stack, ask)}</span>
                      <button onClick={() => setAsk(null)}>Cancel</button>
                      <button className="primary" onClick={run}>{ask === 'up' ? 'Start' : ask === 'stop' ? 'Stop' : 'Pull'}</button>
                    </>
                  ) : (
                    <>
                      <button className="primary" disabled={!!busy || dirty} data-tip={dirty ? 'Save the file first' : undefined} onClick={() => setAsk('up')}>{busy === 'up' ? 'Starting…' : 'Start'}</button>
                      <button disabled={!!busy || !stack.running} onClick={() => setAsk('stop')}>{busy === 'stop' ? 'Stopping…' : 'Stop'}</button>
                      <button className="ghost" disabled={!!busy} onClick={() => setAsk('pull')}>{busy === 'pull' ? 'Pulling…' : 'Pull'}</button>
                    </>
                  )}
                </div>
                {note && <pre className={`stk-note ${note.ok ? 'ok' : 'bad'}`}>{note.text}</pre>}
                <table className="tbl vb-table stk-svcs">
                  <thead><tr><th>Service</th><th>State</th><th>Image</th><th>Ports</th><th /></tr></thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.name}>
                        <td><code>{s.name}</code></td>
                        <td><span className={`ac-state ${s.state}`}>{s.state}</span> <span className="faint">{s.status}</span></td>
                        <td className="faint">{s.image}</td>
                        <td className="faint">{s.ports}</td>
                        <td><button className={`ghost small ${logSvc === s.name ? 'on' : ''}`} onClick={() => pickLog(logSvc === s.name ? '' : s.name)}>Logs</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="stk-split">
                  <div className="stk-file">
                    <div className="stk-filehead">
                      {files.length > 1 ? files.map((f, i) => <button key={f.path} className={`ghost small ${i === fi ? 'on' : ''}`} onClick={() => (setFi(i), setDraft(f.text), setNote(null))}>{f.path.split('/').pop()}</button>) : <code className="faint">{file?.path}</code>}
                      <span className="spacer-flex" />
                      {dirty && <button className="ghost small" onClick={() => (setDraft(file!.text), setNote(null))}>Undo</button>}
                      <button className="small" disabled={!dirty || busy === 'save'} onClick={save}>{busy === 'save' ? 'Checking…' : 'Check and save'}</button>
                    </div>
                    <textarea className="stk-edit" aria-label="Compose file" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} />
                  </div>
                  <div className="stk-logs">
                    <div className="stk-filehead"><span className="sp-label">Logs · {logSvc || 'all services'}</span><span className="spacer-flex" />{logSvc && <button className="ghost small" onClick={() => pickLog('')}>All</button>}</div>
                    <pre ref={logEl} className="stk-log">{logs.length ? logs.join('\n') : 'Nothing logged yet.'}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {err && <div className="bg-err">{err}</div>}
      </div>
    </div>
  )
}
