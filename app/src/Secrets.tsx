import { useEffect, useState } from 'react'
import { clean, friendly } from './errors'
import { IconRefresh, IconClose } from './icons'
import type { EnvFile } from '../electron/envScan'
import { repeats, risks } from './envRisk'

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 3)
const age = (ms: number) => {
  const d = Math.round((Date.now() - ms) / 86_400_000)
  return d < 1 ? 'today' : d < 30 ? `${d}d` : d < 365 ? `${Math.round(d / 30)}mo` : `${(d / 365).toFixed(1)}y`
}
const SHAPE = { 0: <rect x="2" y="2" width="10" height="10" rx="1.5" />, 1: <circle cx="7" cy="7" r="5" />, 2: <path d="M7 2 12.5 12h-11z" /> }

/** Every project's env files: what is exposed, what repeats, and a way to fix each, without showing a value. */
export function SecretsSheet({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<EnvFile[] | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  // keep the last list on screen while scanning, so the sheet does not collapse and flash
  const load = () => {
    setScanning(true)
    window.stm.env.scan().then(setFiles, (e) => setErr(clean(e))).finally(() => setScanning(false))
  }
  useEffect(() => {
    load()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const real = (files ?? []).filter((f) => !f.template)
  const rs = files ? risks(files) : []
  const reps = files ? repeats(files) : []
  const secretCount = real.reduce((n, f) => n + f.keys.filter((k) => k.kind !== 'setting' && k.kind !== 'empty').length, 0)
  const projects = [...new Set(real.map((f) => f.project))]
  const repeatOf = new Map(reps.flatMap((g, i) => g.places.map((p) => [`${p.path}#${p.name}`, i + 1] as const)))

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setErr('')
    try {
      await fn()
      setNote(done)
      load()
    } catch (e) {
      setErr(clean(e))
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet secrets" role="dialog" aria-label="Secrets">
        <header className="sheet-head">
          <div className="sheet-title">Secrets</div>
          <span className="faint">Env files in your projects. Values stay on this Mac and are never shown whole.</span>
          <span className="spacer-flex" />
          <button className="icon" title="Scan again" aria-label="Scan again" onClick={load} disabled={scanning}>{files && !scanning ? <IconRefresh /> : <span className="spinner" />}</button>
          <button className="icon" aria-label="Close" onClick={onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body sc">
          {err && <div className="notice error">{friendly(err)}</div>}
          {note && <div className="notice">{note}</div>}
          {!files && !err && <div className="faint"><span className="spinner" /> Looking through your folders...</div>}
          {files && (
            <>
              <div className="sc-hero">
                <span className="hl-big"><b>{projects.length}</b>projects</span>
                <span className="hl-big"><b>{secretCount}</b>secrets</span>
                <span className="hl-big"><b className={reps.length ? 'warn' : ''}>{reps.length}</b>repeated</span>
                <span className="hl-big"><b className={rs.some((r) => r.level === 0) ? 'hot' : ''}>{rs.filter((r) => r.level < 2).length}</b>at risk</span>
              </div>

              {rs.length > 0 && (
                <section className="sc-sec">
                  <div className="sc-sub">At risk</div>
                  {rs.map((r, i) => (
                    <div key={i} className={`sc-risk l${r.level}`}>
                      <svg width="14" height="14" viewBox="0 0 14 14" className={`l${r.level}`}>{SHAPE[r.level]}</svg>
                      <span className="sc-risk-text"><b>{r.project}</b> <span className="faint">{r.file.split('/').pop()}</span><span>{r.title}</span></span>
                      <span className="sc-risk-act">
                        {r.fix === 'ignore' && <button className="small" onClick={() => void act(() => window.stm.env.ignore(r.file), `Added ${r.file.split('/').pop()} to .gitignore in ${r.project}`)}>Add to .gitignore</button>}
                        <button className="ghost small" onClick={() => void window.stm.env.reveal(r.file)}>Show</button>
                      </span>
                    </div>
                  ))}
                </section>
              )}

              {reps.length > 0 && (
                <section className="sc-sec">
                  <div className="sc-sub">The same value in several places</div>
                  <div className="sc-reps">
                    {reps.map((g, i) => (
                      <div key={g.hash} className="sc-rep">
                        <span className="sc-rep-n" style={{ background: `hsl(${hue(g.hash)} 60% 55%)` }}>{i + 1}</span>
                        <span className="sc-rep-v"><code>{g.masked}</code> <span className="faint">{g.kind}</span></span>
                        <span className="sc-rep-places">{g.places.map((p) => <span key={p.path + p.name} className="chip">{p.project.split('/').pop()}/{p.path.split('/').pop()} · {p.name}</span>)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="faint sc-fine">One key in many projects means one leak exposes all of them. Prefer one key per project.</p>
                </section>
              )}

              <section className="sc-sec">
                <div className="sc-sub">By project</div>
                <div className="sc-grid">
                  {real.map((f) => {
                    const secrets = f.keys.filter((k) => k.kind !== 'setting' && k.kind !== 'empty')
                    const state = f.git.tracked || f.git.inHistory ? 'bad' : f.git.inRepo && !f.git.ignored ? 'warn' : 'ok'
                    return (
                      <div key={f.path} className={`sc-card ${state} ${open === f.path ? 'open' : ''}`}>
                        <button className="sc-card-head" onClick={() => setOpen(open === f.path ? null : f.path)}>
                          <span className={`sc-state ${state}`} title={state === 'bad' ? 'In git' : state === 'warn' ? 'Not ignored by git' : 'Ignored by git'} />
                          <b>{f.project}</b>
                          <span className="faint">{f.path.split('/').pop()} · {age(f.mtime)}</span>
                        </button>
                        <span className="sc-dots" aria-label={`${secrets.length} secrets, ${f.keys.length - secrets.length} settings`}>
                          {f.keys.map((k) => <i key={k.name} className={k.kind === 'setting' || k.kind === 'empty' ? 'set' : 'sec'} title={`${k.name}: ${k.kind}`} />)}
                        </span>
                        {open === f.path && (
                          <div className="sc-keys">
                            {f.keys.map((k) => {
                              const rep = repeatOf.get(`${f.path}#${k.name}`)
                              const secret = k.kind !== 'setting' && k.kind !== 'empty'
                              return (
                                <div key={k.name} className="sc-key">
                                  <span className="sc-kname">{k.name}{rep && <span className="sc-rep-n small" style={{ background: `hsl(${hue(reps[rep - 1]!.hash)} 60% 55%)` }}>{rep}</span>}</span>
                                  <code className="faint">{k.masked || 'empty'}</code>
                                  <span className={`sc-kind ${secret ? 'sec' : ''}`}>{k.kind}</span>
                                  {secret && !k.empty && (
                                    <button className="ghost small" title="Copies the value into the encrypted vault; the file is left as it is" onClick={() => void act(() => window.stm.env.toVault(f.path, k.name, k.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')), `${k.name} copied to the vault`)}>To vault</button>
                                  )}
                                </div>
                              )
                            })}
                            <button className="ghost small" onClick={() => void window.stm.env.reveal(f.path)}>Show in Finder</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
              {real.length === 0 && <div className="note">No env files under your home folder.</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
