import { useEffect, useState } from 'react'
import { checkRemoteDir } from '../shared/remote'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { IconClose, IconRemote } from './icons'
import './bridge'

type Check = Awaited<ReturnType<typeof window.stm.remote.check>>

/**
 * A panel on one of your machines: Claude Code runs there, started over SSH with your keys, in a folder
 * there or a fresh worktree of it. It uses that machine's own Claude Code login; nothing from the vault
 * goes along.
 */
export function RemotePanelSheet(props: { onClose: () => void; onOpen: (r: { host: string; dir: string; worktree: boolean }) => Promise<void> }) {
  const [hosts, setHosts] = useState<string[] | null>(null)
  const [host, setHost] = useState('')
  const [dir, setDir] = useState('~/')
  const [wt, setWt] = useState(true)
  const [chk, setChk] = useState<Check | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.remote.hosts().then((h) => (setHosts(h), setHost((x) => x || h[0] || ''))), [])
  const dirErr = checkRemoteDir(dir)
  const reset = () => (setChk(null), setErr(''))
  const check = async () => {
    setBusy('check')
    reset()
    try {
      setChk(await window.stm.remote.check(host, dir))
    } catch (e) {
      setErr(clean(e))
    }
    setBusy('')
  }
  const ready = !!chk?.claude && chk.dir && (!wt || (chk.repo && !!chk.git))
  const open = async () => {
    setBusy('open')
    setErr('')
    try {
      await props.onOpen({ host, dir, worktree: wt })
      props.onClose()
    } catch (e) {
      setErr(clean(e))
    }
    setBusy('')
  }
  const row = (label: string, ok: boolean, text: string) => (
    <>
      <span className="faint">{label}</span>
      <span className={ok ? 'ok' : 'bad'}>{text}</span>
    </>
  )
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe rm" role="dialog" aria-label="Panel on another machine">
        <header className="sheet-head">
          <div className="sheet-title">Panel on another machine</div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="dsg-body">
          <div className="faint">Claude Code runs on that machine, started over SSH with your keys (no password prompts). It uses that machine's own Claude Code login: no key from this Mac's vault goes along. The app's panels, memory and approvals work as usual; git, the terminal and the files stay on that machine, and a port there can be forwarded to the Browse tab.</div>
          <div className="fld-grid">
            <label className="fld"><span className="fld-label">Host, from ~/.ssh/config</span>
              {hosts && hosts.length ? (
                <select value={host} onChange={(e) => (setHost(e.target.value), reset())}>{hosts.map((h) => <option key={h}>{h}</option>)}</select>
              ) : <input value={host} placeholder="build-box" onChange={(e) => (setHost(e.target.value.trim()), reset())} />}
            </label>
            <label className="fld"><span className="fld-label">Folder there</span><input value={dir} onChange={(e) => (setDir(e.target.value), reset())} spellCheck={false} /><span className="fld-help">{dirErr ?? '/path or ~/path of a git checkout.'}</span></label>
            <label className="check wide"><input type="checkbox" checked={wt} onChange={(e) => (setWt(e.target.checked), reset())} /> Work in a fresh worktree there (~/.stm-worktrees, its own branch), not in the folder itself</label>
          </div>
          {chk && (
            <div className="rm-check">
              {row('Claude Code', !!chk.claude, chk.claude ?? 'not found on PATH: install it there and run claude once to log in')}
              {row('git', !!chk.git, chk.git ?? 'not found')}
              {row('Folder', chk.dir, chk.dir ? 'exists' : 'not there')}
              {wt && row('Repository', chk.repo, chk.repo ? 'a git checkout' : 'not a git checkout: a worktree needs one')}
            </div>
          )}
          {err && <div className="notice error">{err}</div>}
          <div className="ob-row">
            <button disabled={!host || !!dirErr || !!busy} onClick={() => void check()}>{busy === 'check' ? <StateMark state="busy" label="Checking" /> : null}Check the machine</button>
            <span className="spacer-flex" />
            <button className="primary" disabled={!ready || !!busy} onClick={() => void open()}>{busy === 'open' ? <StateMark state="busy" label="Opening" /> : <IconRemote />}Open the panel there</button>
          </div>
        </div>
      </div>
    </div>
  )
}
