import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { best, TARGETS, type Target } from '../shared/shot2code'
import type { Job, RoundView } from '../electron/shot2code'
import { clean } from './errors'
import './bridge'

const close = (
  <IconClose />
)
type Item = Awaited<ReturnType<typeof window.stm.s2c.list>>[number]
const readImage = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result))
  r.onerror = () => rej(new Error('Could not read the file.'))
  r.readAsDataURL(f)
})

/**
 * Screenshot to code: an image, a sketch or a mockup becomes files (HTML or React with Tailwind), is
 * rendered and compared with the image, and Claude fixes what differs for a set number of rounds.
 * Ideas from abi/screenshot-to-code (MIT); no code from it.
 */
export function ShotToCodeSheet(props: { cwd?: string; onClose: () => void }) {
  const [jobs, setJobs] = useState<Item[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [note, setNote] = useState('')
  const [form, setForm] = useState<{ name: string; target: Target; image: string; rounds: number; target_: number; note: string } | null>(null)
  const [view, setView] = useState<number | null>(null)
  const [folder, setFolder] = useState('src/screens')
  const [clash, setClash] = useState<string[]>([])
  const [protoIds, setProtoIds] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const load = () => void window.stm.s2c.list().then((l) => (setJobs(l), setPick((p) => p ?? l[0]?.id ?? null)))
  useEffect(() => {
    load()
    return window.stm.s2c.onProgress((p) => {
      setNote(p.note)
      load()
      setPick((cur) => {
        if (cur === p.id) void window.stm.s2c.get(p.id).then(setJob)
        return cur
      })
    })
  }, [])
  useEffect(() => void (pick ? window.stm.s2c.get(pick).then((j) => (setJob(j), setView(null), setClash([]))) : setJob(null)), [pick])
  const drop = async (f?: File | null) => {
    if (!f) return
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setErr('Give a PNG, JPEG or WebP image.')
    setErr('')
    setForm({ name: f.name.replace(/\.\w+$/, ''), target: 'html', image: await readImage(f), rounds: 3, target_: 5, note: '' })
  }
  const start = () => {
    if (!form || !props.cwd) return
    void window.stm.s2c.start({ name: form.name, target: form.target, project: props.cwd, image: form.image, rounds: form.rounds, maxDiff: form.target_, note: form.note }).then((id) => (setForm(null), setPick(id), load()), (e) => setErr(clean(e)))
  }
  const top = job ? best(job.rounds) : null
  const shown: RoundView | undefined = job?.rounds.find((r) => r.n === (view ?? top?.n ?? job.rounds[job.rounds.length - 1]?.n))
  const apply = (overwrite: boolean) => job && shown && void window.stm.s2c.apply(job.id, shown.n, folder, overwrite).then((r) => (r.clash.length ? (setClash(r.clash), setMsg('')) : (setClash([]), setMsg(`Wrote ${r.written.join(', ')}.`))), (e) => setErr(clean(e)))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Screenshot to code">
        <header className="sheet-head">
          <div className="sheet-title">Screenshot to code</div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        <div className="cf-body s2c-body">
          <div className="cf-col ob-list">
            <label className="s2c-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), void drop(e.dataTransfer.files[0]))}>
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void drop(e.target.files?.[0])} />
              <b>Drop a screenshot, sketch or mockup</b>
              <span className="faint">or click to pick one. Your own designs; someone else's site only as a layout reference.</span>
            </label>
            {!props.cwd && <div className="notice error">Open a panel on a project first: files go there when you apply.</div>}
            {jobs.map((j) => (
              <div key={j.id} className="s2c-item">
                {j.target === 'html' && <input type="checkbox" aria-label={`Add ${j.name} to the prototype`} checked={protoIds.includes(j.id)} onChange={(e) => setProtoIds((l) => (e.target.checked ? [...l, j.id] : l.filter((x) => x !== j.id)))} />}
                <button className={`ob-turn ${j.id === pick ? 'on' : ''}`} onClick={() => (setPick(j.id), setForm(null))}>
                  <span className="ob-turn-top"><span>{j.name}</span><span className="faint">{TARGETS[j.target].label}</span></span>
                  <span className="faint">{j.rounds.length} {j.rounds.length === 1 ? 'round' : 'rounds'}{best(j.rounds) ? `, best ${best(j.rounds)!.percent}% differ` : ''}{j.running ? ', running' : j.stopped ? `, ${j.stopped}` : ''}</span>
                </button>
              </div>
            ))}
            {protoIds.length >= 2 && (
              <div className="ob-row">
                <button onClick={() => void window.stm.s2c.prototype(protoIds, `${folder.replace(/\/+$/, '')}/prototype`).then((f) => setMsg(`Prototype written to ${f}.`), (e) => setErr(clean(e)))}>Link {protoIds.length} screens as a prototype</button>
              </div>
            )}
          </div>
          <div className="cf-col">
            {form ? (
              <>
                <img className="s2c-img" src={form.image} alt="The image to rebuild" />
                <div className="mn-form">
                  <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                  <label>Write as<select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value as Target })}>{Object.entries(TARGETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
                  <label>Rounds at most<input type="number" min={1} max={6} value={form.rounds} onChange={(e) => setForm({ ...form, rounds: Number(e.target.value) })} /></label>
                  <label>Stop under (% differ)<input type="number" min={0.5} step={0.5} value={form.target_} onChange={(e) => setForm({ ...form, target_: Number(e.target.value) })} /></label>
                  <label className="wide">Note for Claude<input placeholder="optional, such as: the sidebar collapses on mobile" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
                </div>
                <div className="faint">Each round is one call on your Claude plan, checked by the budget brake. The project's components and Tailwind or CSS tokens go along with the image.</div>
                <div className="ob-row">
                  <button className="primary" disabled={!props.cwd} onClick={start}>Start</button>
                  <button onClick={() => setForm(null)}>Cancel</button>
                </div>
              </>
            ) : job ? (
              <>
                <div className="ob-row">
                  <div className="ob-prompt ob-grow">{job.name}</div>
                  {job.running && <button onClick={() => void window.stm.s2c.stop(job.id)}>Stop</button>}
                </div>
                <div className="faint">{job.running ? note : job.stopped ?? 'Done.'}</div>
                <div className="ob-row" role="tablist" aria-label="Rounds">
                  {job.rounds.map((r) => (
                    <button key={r.n} role="tab" aria-selected={r === shown} className={r === shown ? 'primary' : ''} onClick={() => setView(r.n)}>Round {r.n}: {r.percent == null ? 'n/a' : `${r.percent}%`}{r === top ? ', best' : ''}</button>
                  ))}
                </div>
                <div className="s2c-grid">
                  <figure><figcaption className="ob-label">Image</figcaption><img src={job.image} alt="The image" /></figure>
                  <figure><figcaption className="ob-label">Render</figcaption>{shown?.render ? <img src={shown.render} alt="The code rendered" /> : <div className="s2c-empty faint">{shown?.note ?? 'Waiting for the first round.'}</div>}</figure>
                  <figure><figcaption className="ob-label">Differences</figcaption>{shown?.diff ? <img src={shown.diff} alt="Pixels that differ" /> : <div className="s2c-empty faint">None yet.</div>}</figure>
                </div>
                {shown?.files.map((f) => (
                  <details key={f.path} className="s2c-file"><summary>{f.path} <span className="faint">{f.content.split('\n').length} lines</span></summary><pre className="ob-pre">{f.content}</pre></details>
                ))}
                {shown?.files.length ? (
                  <>
                    <div className="ob-label">Apply round {shown.n} to the project</div>
                    <div className="ob-row">
                      <input className="ob-grow" value={folder} onChange={(e) => (setFolder(e.target.value), setClash([]))} aria-label="Folder in the project" />
                      <button className="primary" onClick={() => apply(false)}>Apply</button>
                    </div>
                    {clash.length > 0 && (
                      <div className="notice error ob-row">
                        <span className="ob-grow">Already there: {clash.join(', ')}.</span>
                        <button onClick={() => apply(true)}>Replace them</button>
                      </div>
                    )}
                  </>
                ) : null}
              </>
            ) : (
              <div className="faint">Drop an image to start. Rounds, renders and the differences show here.</div>
            )}
            {msg && <div className="notice">{msg}</div>}
            {err && <div className="notice error">{err}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
