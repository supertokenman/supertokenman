import { useEffect, useRef, useState } from 'react'
import { IconClose } from './icons'
import { StateMark } from './StateMark'
import { clean, friendly } from './errors'
import type { Container, Image, Volume } from '../electron/docker'
import { hostLabel, type Host } from '../shared/dockerhosts'
import { Checkbox, Select, confirmDialog } from './ui'

type Tab = 'containers' | 'images' | 'volumes'

/** One container's logs, refreshed every 2 s, with a one-off command box and Ask Claude. */
function Detail(props: { c: Container; onAsk: (text: string) => void; gate: (q: string) => Promise<boolean>; remote: boolean; canAct: boolean }) {
  const { c } = props
  const [log, setLog] = useState('')
  const [cmd, setCmd] = useState('')
  const [out, setOut] = useState<{ cmd: string; out: string; code: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLPreElement>(null)
  const stick = useRef(true)
  useEffect(() => {
    let alive = true
    const pull = async () => {
      try {
        const l = await window.stm.docker.logs(c.id)
        if (alive) setLog(l)
      } catch (e) {
        if (alive) setLog(clean(e))
      }
    }
    void pull()
    const t = c.state === 'running' ? setInterval(() => void pull(), 2000) : undefined
    return () => {
      alive = false
      if (t) clearInterval(t)
    }
  }, [c.id, c.state])
  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [log])

  const run = async () => {
    if (!cmd.trim() || !(await props.gate(`run "${cmd}" in ${c.name}?`))) return
    setBusy(true)
    try {
      setOut({ cmd, ...(await window.stm.docker.exec(c.id, cmd, props.remote)) })
    } catch (e) {
      setOut({ cmd, out: clean(e), code: 1 })
    } finally {
      setBusy(false)
    }
  }
  const tail = log.split('\n').slice(-60).join('\n')

  return (
    <div className="dk-detail">
      <pre className="dk-log" ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8 }}>
        {log ? log.split('\n').map((l, i) => {
          const m = l.match(/^(\S+T(\d\d:\d\d:\d\d))\S*\s(.*)$/)
          return <div key={i} className={/\b(error|err|fatal|panic|exception)\b/i.test(l) ? 'bad' : ''}>{m ? <><span className="dk-time">{m[2]}</span>{m[3]}</> : l}</div>
        }) : <span className="faint">No logs yet.</span>}
      </pre>
      <div className="dk-actions">
        {c.state === 'running' && props.canAct && (
          <form className="dk-exec" onSubmit={(e) => { e.preventDefault(); void run() }}>
            <span className="dk-prompt">{c.name} $</span>
            <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="ls /app, env, cat package.json" spellCheck={false} />
            <button className="small" disabled={busy || !cmd.trim()}>{busy ? 'Running...' : 'Run'}</button>
          </form>
        )}
        <button className="ghost small" onClick={() => props.onAsk(`The Docker container "${c.name}" (image ${c.image}${c.project ? `, Compose project ${c.project}, service ${c.service}` : ''}) is ${c.status}. Its last log lines:\n\n\`\`\`\n${tail}\n\`\`\`\n\nWhat is going on, and what should I change? Look at this repository's Dockerfile and compose file if there are any.`)}>
          Ask Claude about it
        </button>
      </div>
      {out && (
        <pre className={`dk-out ${out.code ? 'bad' : ''}`}>
          <span className="faint">$ {out.cmd}{out.code ? `  (exit ${out.code})` : ''}</span>
          {'\n'}{out.out || '(no output)'}
        </pre>
      )}
    </div>
  )
}

// running breathes, restarting turns, paused asks, stopped is a ghost
const Dot = ({ state }: { state: string }) => (
  <StateMark state={state === 'running' ? 'up' : state === 'restarting' ? 'busy' : state === 'paused' ? 'warn' : state === 'dead' ? 'down' : 'off'} label={state} />
)

/** Docker: containers grouped by Compose project, images and volumes. */
export function Docker(props: { onClose: () => void; onAsk: (text: string) => void }) {
  const [tab, setTab] = useState<Tab>('containers')
  const [cs, setCs] = useState<Container[] | null>(null)
  const [imgs, setImgs] = useState<Image[] | null>(null)
  const [vols, setVols] = useState<Volume[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [all, setAll] = useState(true)
  const [hosts, setHosts] = useState<Host[]>([])
  const [sel, setSel] = useState('')
  const [writable, setWritable] = useState<Record<string, boolean>>({})
  const host = sel ? hosts.find((h) => h.name === sel) : hosts.find((h) => h.current)
  const remote = Boolean(host?.remote)
  const canAct = !remote || Boolean(host && writable[host.name])
  // a remote host asks every time, naming it; this machine keeps the screen's own asks
  const gate = async (q: string) => (remote ? confirmDialog({ title: `On ${host!.name} (${hostLabel(host!)})`, message: q.charAt(0).toUpperCase() + q.slice(1) }) : true)
  const ro = canAct ? undefined : 'Read-only host: turn on actions for it first'
  useEffect(() => void window.stm.docker.hosts().then((r) => (setHosts(r.hosts), setSel(r.selected), setWritable(r.writable)), () => undefined), [])
  const pickHost = (name: string) => void window.stm.docker.setHost(name).then((n) => (setSel(n), setCs(null), setImgs(null), setVols(null), setOpen(null), setErr('')), (e) => setErr(clean(e)))
  const toggleWrite = async (on: boolean) => host && (!on || (await confirmDialog({ message: `Allow start, stop, remove and commands on ${host.name} (${hostLabel(host)})? Each one still asks.`, confirm: 'Allow' }))) && void window.stm.docker.setWritable(host.name, on).then(setWritable, (e) => setErr(clean(e)))

  const refresh = async () => {
    try {
      if (tab === 'containers') setCs(await window.stm.docker.containers())
      if (tab === 'images') setImgs(await window.stm.docker.images())
      if (tab === 'volumes') setVols(await window.stm.docker.volumes())
      setErr('')
    } catch (e) {
      setErr(clean(e))
    }
  }
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sel])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setErr('')
    try {
      await fn()
      await refresh()
    } catch (e) {
      setErr(clean(e))
    } finally {
      setBusy('')
    }
  }

  const shown = (cs ?? []).filter((c) => all || c.state === 'running')
  const groups = new Map<string, Container[]>()
  for (const c of shown) groups.set(c.project, [...(groups.get(c.project) ?? []), c])
  const running = (cs ?? []).filter((c) => c.state === 'running').length

  const row = (c: Container) => {
    const on = c.state === 'running'
    return (
      <div key={c.id} className={`dk-row ${open === c.id ? 'open' : ''}`}>
        <button className="dk-main" onClick={() => setOpen(open === c.id ? null : c.id)}>
          <Dot state={c.state} />
          <span className="dk-name">{c.service || c.name}</span>
          <span className="faint dk-image">{c.image}</span>
          <span className="dk-ports">{c.ports.split(', ').filter((p) => p.includes('->')).map((p) => p.replace(/^.*:(\d+)->(\d+).*$/, '$1→$2')).filter((v, i, a) => a.indexOf(v) === i).join(' ')}</span>
          <span className="faint dk-stat">{on ? [c.cpu, c.mem].filter(Boolean).join(' · ') : c.status}</span>
        </button>
        <span className="dk-btns">
          {on ? (
            <>
              <button className="icon" data-tip={ro ?? 'Restart'} aria-label={ro ?? 'Restart'} disabled={!!busy || !canAct} onClick={async () => (await gate(`restart ${c.name}?`)) && void act(`restart-${c.id}`, () => window.stm.docker.act('restart', c.id, remote))}>{busy === `restart-${c.id}` ? '…' : '↻'}</button>
              <button className="icon" data-tip={ro ?? 'Stop'} aria-label={ro ?? 'Stop'} disabled={!!busy || !canAct} onClick={async () => (await gate(`stop ${c.name}?`)) && void act(`stop-${c.id}`, () => window.stm.docker.act('stop', c.id, remote))}>{busy === `stop-${c.id}` ? '…' : <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="currentColor" /></svg>}</button>
            </>
          ) : (
            <>
              <button className="icon" data-tip={ro ?? 'Start'} aria-label={ro ?? 'Start'} disabled={!!busy || !canAct} onClick={async () => (await gate(`start ${c.name}?`)) && void act(`start-${c.id}`, () => window.stm.docker.act('start', c.id, remote))}>{busy === `start-${c.id}` ? '…' : <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 1.5v7l6-3.5z" fill="currentColor" /></svg>}</button>
              <button className="icon" data-tip={ro ?? 'Remove'} aria-label={ro ?? 'Remove'} disabled={!!busy || !canAct} onClick={async () => (await (remote ? gate(`remove ${c.name}?`) : confirmDialog({ message: `Remove ${c.name}?`, confirm: 'Remove', danger: true }))) && void act(`rm-${c.id}`, () => window.stm.docker.act('rm', c.id, remote))}>×</button>
            </>
          )}
        </span>
        {open === c.id && <Detail c={c} gate={gate} remote={remote} canAct={canAct} onAsk={(t) => { props.onAsk(t); props.onClose() }} />}
      </div>
    )
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet docker" role="dialog" aria-label="Docker">
        <header className="sheet-head">
          <div className="sheet-title">Docker</div>
          {cs && <span className="faint">{running} running</span>}
          {hosts.length > 1 && (
            <Select className="dk-host" aria-label="Host" value={host?.name ?? ''} onChange={(e) => pickHost(e.target.value)}>
              {hosts.map((h) => <option key={h.name} value={h.name}>{h.name}{h.remote ? ` · ${hostLabel(h)}` : ''}</option>)}
            </Select>
          )}
          <div className="segmented" role="tablist">
            {(['containers', 'images', 'volumes'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body">
          {remote && host && (
            <div className={`dk-remote ${canAct ? 'live' : ''}`}>
              <span className="dk-remote-tag">{canAct ? 'ACTIONS ON' : 'READ-ONLY'}</span>
              <span><b>{host.name}</b> <code className="faint">{host.endpoint}</code></span>
              <span className="spacer-flex" />
              <span className="faint">{canAct ? 'Each action asks, naming this host.' : 'Containers, logs, images and volumes; nothing can be changed.'}</span>
              <button className="ghost small" onClick={() => toggleWrite(!canAct)}>{canAct ? 'Back to read-only' : 'Turn on actions'}</button>
            </div>
          )}
          {err && <div className="notice error">{friendly(err)}</div>}
          {tab === 'containers' && (
            <>
              {cs && cs.length > 0 && (
                <label className="dk-toggle faint"><Checkbox checked={all} onChange={(e) => setAll(e.target.checked)} /> Show stopped</label>
              )}
              {!cs && !err && <div className="faint">Asking Docker...</div>}
              {cs && shown.length === 0 && <div className="note">No containers{all ? '' : ' running'}.</div>}
              {[...groups.entries()].map(([project, list]) => (
                <section key={project || '-'} className="dk-group">
                  {project ? (
                    <div className="dk-group-head">
                      <span className="group">{project}</span>
                      <span className="faint">{list.filter((c) => c.state === 'running').length}/{list.length}</span>
                    </div>
                  ) : groups.size > 1 ? <div className="dk-group-head"><span className="group">Standalone</span></div> : null}
                  {list.map(row)}
                </section>
              ))}
            </>
          )}
          {tab === 'images' && (imgs ?? []).map((i) => (
            <div key={i.id + i.tag} className="dk-row flat">
              <span className="dk-main static">
                <span className="dk-name">{i.repo}<span className="faint">:{i.tag}</span></span>
                <span className="faint dk-image">{i.id}</span>
                <span className="dk-ports">{i.size}</span>
                <span className="faint dk-stat">{i.created}{i.inUse ? ` · used by ${i.inUse}` : ''}</span>
              </span>
              <span className="dk-btns"><button className="icon" data-tip={ro ?? 'Remove image'} aria-label={ro ?? 'Remove image'} disabled={!!busy || !canAct} onClick={async () => (await (remote ? gate(`remove image ${i.repo}:${i.tag}?`) : confirmDialog({ message: `Remove ${i.repo}:${i.tag}?`, confirm: 'Remove', danger: true }))) && void act(`rmi-${i.id}`, () => window.stm.docker.removeImage(i.repo === '<none>' ? i.id : `${i.repo}:${i.tag}`, remote))}>×</button></span>
            </div>
          ))}
          {tab === 'volumes' && (vols ?? []).map((v) => (
            <div key={v.name} className="dk-row flat">
              <span className="dk-main static">
                <span className="dk-name">{v.name}</span>
                <span className="faint dk-image">{v.project}</span>
                <span />
                <span className="faint dk-stat">{v.driver}</span>
              </span>
              <span className="dk-btns"><button className="icon" data-tip={ro ?? 'Remove volume (its data is lost)'} aria-label={ro ?? 'Remove volume (its data is lost)'} disabled={!!busy || !canAct} onClick={async () => (await (remote ? gate(`remove volume ${v.name}? Its data is deleted.`) : confirmDialog({ message: `Remove volume ${v.name}? Its data is deleted.`, confirm: 'Remove', danger: true }))) && void act(`rmv-${v.name}`, () => window.stm.docker.removeVolume(v.name, remote))}>×</button></span>
            </div>
          ))}
          {tab !== 'containers' && ((tab === 'images' ? imgs : vols)?.length === 0) && <div className="note">None.</div>}
        </div>
      </div>
    </div>
  )
}
