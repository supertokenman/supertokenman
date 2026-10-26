import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { byPackage, counts, isAccepted, SEVERITIES, type Finding, type Kind } from '../shared/trivy'
import type { LeakScan, SecScan } from './bridge'
import type { Leak } from '../shared/leaks'
import { clean } from './errors'
import './bridge'

const close = (
  <IconClose />
)
type St = Awaited<ReturnType<typeof window.stm.sec.state>>
const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const KINDS: Record<Kind, string> = { fs: 'Project', config: 'Infrastructure files', image: 'Docker image' }
const SEV_WORD: Record<string, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', UNKNOWN: 'Unknown' }

/**
 * Security: trivy (Apache-2.0, your own install) on the project, its infrastructure files or a built
 * image. Findings by severity with the version that fixes them, one click to hand one to the panel,
 * accepted findings with a reason and an end date, an SBOM per release, and the gate before a deploy.
 */
export function SecuritySheet(props: { cwd?: string; sid?: string; onClose: () => void }) {
  const [tab, setTab] = useState<'deps' | 'secrets'>('deps')
  const tabs = (
    <div className="segmented small" role="tablist">
      <button role="tab" aria-selected={tab === 'deps'} onClick={() => setTab('deps')}>Dependencies and config</button>
      <button role="tab" aria-selected={tab === 'secrets'} onClick={() => setTab('secrets')}>Leaked secrets</button>
    </div>
  )
  return tab === 'deps' ? <Deps {...props} tabs={tabs} /> : <Shell onClose={props.onClose} tabs={tabs}>{props.cwd ? <Secrets project={props.cwd} sid={props.sid} /> : <div className="dsg-body faint">Open a panel on a project first; the scan runs on that folder.</div>}</Shell>
}

function Deps(props: { cwd?: string; sid?: string; onClose: () => void; tabs: React.ReactNode }) {
  const project = props.cwd ?? ''
  const [st, setSt] = useState<St | null>(null)
  const [kind, setKind] = useState<Kind>('fs')
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState<SecScan | null>(null)
  const [view, setView] = useState<'all' | 'packages'>('all')
  const [sev, setSev] = useState<string>('ALL')
  const [pick, setPick] = useState<Finding | null>(null)
  const [why, setWhy] = useState('')
  const [days, setDays] = useState(30)
  const [apps, setApps] = useState<{ uuid: string; name: string }[]>([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const load = () => void window.stm.sec.state(project).then((s) => (setSt(s), setScan((cur) => cur ?? s.scans[0] ?? null)), (e) => setErr(clean(e)))
  useEffect(() => {
    if (!project) return
    load()
    void Promise.all([window.stm.deploys.coolify().then((c) => c.apps.map((a) => ({ uuid: a.uuid, name: `${a.name} (Coolify)` })), () => []), window.stm.deploys.dokploy().then((c) => c.apps.map((a) => ({ uuid: a.uuid, name: `${a.name} (Dokploy)` })), () => [])]).then(([a, b]) => setApps([...a, ...b]))
  }, [project])
  if (!project) return <Shell onClose={props.onClose} tabs={props.tabs}><div className="dsg-body faint">Open a panel on a project first; the scan runs on that folder.</div></Shell>
  const run = () => (setBusy(true), setErr(''), void window.stm.sec.scan(project, kind, image).then((s) => (setScan(s), setPick(null), load()), (e) => setErr(clean(e))).finally(() => setBusy(false)))
  const acc = st?.accepted ?? []
  const now = Date.now()
  const list = (scan?.findings ?? []).filter((f) => sev === 'ALL' || f.severity === sev)
  const c = counts(scan?.findings ?? [])
  const linked = Object.entries(st?.gates ?? {}).filter(([, p]) => p === project).map(([u]) => u)
  return (
    <Shell onClose={props.onClose} tabs={props.tabs}>
      <div className="cf-body">
        <div className="cf-col ob-list">
          <div className="faint">{st?.trivy ? `trivy at ${st.trivy}. Only your own projects and images.` : 'trivy is not installed. On a Mac: brew install trivy. The first scan downloads its vulnerability database.'}</div>
          <div className="ob-row">
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            {kind === 'image' && <input className="ob-grow" placeholder="name:tag" value={image} onChange={(e) => setImage(e.target.value)} />}
            <button className="primary" disabled={busy || !st?.trivy || (kind === 'image' && !image)} onClick={run}>{busy ? 'Scanning…' : 'Scan'}</button>
          </div>
          {scan && (
            <>
              <div className="sec-counts">
                {(['ALL', ...SEVERITIES] as const).map((s) => (
                  <button key={s} className={`sec-count ${s.toLowerCase()} ${sev === s ? 'on' : ''}`} onClick={() => setSev(s)}>
                    <span className="ob-label">{s === 'ALL' ? 'All' : SEV_WORD[s]}</span>
                    <b>{s === 'ALL' ? scan.findings.length : c[s]}</b>
                  </button>
                ))}
              </div>
              <div className="ob-row">
                <span className="faint ob-grow">{KINDS[scan.kind]} scanned {when(scan.at)} in {(scan.ms / 1000).toFixed(1)} s</span>
                <div className="segmented small" role="tablist">
                  <button role="tab" aria-selected={view === 'all'} onClick={() => setView('all')}>Findings</button>
                  <button role="tab" aria-selected={view === 'packages'} onClick={() => setView('packages')}>By package</button>
                </div>
              </div>
              {view === 'all'
                ? list.map((f) => (
                    <button key={f.key} className={`ob-turn sec-f ${f === pick ? 'on' : ''} ${isAccepted(f, acc, now) ? 'accepted' : ''}`} onClick={() => setPick(f)}>
                      <span className="ob-turn-top"><span className="sec-id"><span className={`sec-sev ${f.severity.toLowerCase()}`}>{SEV_WORD[f.severity]}</span>{f.id}</span><span className="faint">{f.kind === 'vuln' ? f.pkg : f.kind === 'misconfig' ? 'config' : 'license'}</span></span>
                      <span className="ob-turn-prompt faint">{isAccepted(f, acc, now) ? 'Accepted: ' : ''}{f.title}</span>
                    </button>
                  ))
                : byPackage(scan.findings).map((p) => (
                    <div key={p.target + p.pkg} className="mn-inc sec-pkg">
                      <span className={`sec-sev ${p.worst.toLowerCase()}`}>{SEV_WORD[p.worst]}</span>
                      <span className="ob-sum"><b>{p.pkg}</b> <span className="faint">{p.installed} in {p.target}</span></span>
                      <span className="faint">{p.fixTo ? `fix: ${p.fixTo}` : 'no fix yet'}{p.unfixed && p.fixTo ? `, ${p.unfixed} without fix` : ''}, {p.ids.length} {p.ids.length === 1 ? 'advisory' : 'advisories'}</span>
                    </div>
                  ))}
              {!scan.findings.length && <div className="notice">Nothing found.</div>}
            </>
          )}
        </div>
        <div className="cf-col">
          {pick ? (
            <>
              <div className="ob-head">
                <div className="ob-prompt">{pick.id}: {pick.title}</div>
                <div className="faint">{pick.target}{pick.line ? ` line ${pick.line}` : ''}{pick.pkg ? `, ${pick.pkg} ${pick.installed ?? ''}` : ''}{pick.fixed ? `, fixed in ${pick.fixed}` : ''}</div>
              </div>
              {pick.resolution && <div>{pick.resolution}</div>}
              {pick.url && <a href={pick.url} target="_blank" rel="noreferrer">{pick.url}</a>}
              <div className="ob-row">
                <button className="primary" disabled={!props.sid} onClick={() => void window.stm.sec.fixMessage(pick).then((t) => (window.dispatchEvent(new CustomEvent('stm:prefill', { detail: { sid: props.sid, text: t } })), setMsg('Put in the panel composer; read it and send.')))}>{pick.kind === 'license' ? 'Ask the panel' : 'Fix in the panel'}</button>
              </div>
              <div className="ob-label">Accept it</div>
              {isAccepted(pick, acc, now) ? (
                <div className="ob-row">
                  <span className="ob-grow faint">Accepted until {when(acc.find((a) => a.key === pick.key)!.until)}: {acc.find((a) => a.key === pick.key)!.note}</span>
                  <button onClick={() => void window.stm.sec.unaccept(project, pick.key).then(load)}>Undo</button>
                </div>
              ) : (
                <div className="ob-row">
                  <input className="ob-grow" placeholder="Why it is acceptable (required)" value={why} onChange={(e) => setWhy(e.target.value)} />
                  <input className="mn-hours" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days" />
                  <span className="faint">days</span>
                  <button disabled={!why.trim()} onClick={() => void window.stm.sec.accept(project, pick.key, why, days).then(() => (setWhy(''), load()), (e) => setErr(clean(e)))}>Accept</button>
                </div>
              )}
            </>
          ) : (
            <div className="faint">Pick a finding to see it, hand it to the panel or accept it with a reason.</div>
          )}
          <div className="ob-label">Gate before deploy</div>
          <div className="faint">A deploy of a linked app stops while the last project scan has critical findings that are not fixed or accepted.</div>
          {apps.length ? (
            <div className="sec-gates">
              {apps.map((a) => (
                <label key={a.uuid} className="check"><input type="checkbox" checked={linked.includes(a.uuid)} onChange={(e) => void window.stm.sec.setGate(a.uuid, e.target.checked ? project : null).then(load)} /> {a.name}</label>
              ))}
            </div>
          ) : <div className="faint">No apps found; connect Coolify or Dokploy in Deploys to use the gate.</div>}
          <div className="ob-label">SBOM</div>
          <div className="ob-row">
            <button disabled={!st?.trivy || busy} onClick={() => void window.stm.sec.sbom(project, 'cyclonedx').then((f) => setMsg(`CycloneDX saved to ${f}.`), (e) => setErr(clean(e)))}>Save CycloneDX</button>
            <button disabled={!st?.trivy || busy} onClick={() => void window.stm.sec.sbom(project, 'spdx-json').then((f) => setMsg(`SPDX saved to ${f}.`), (e) => setErr(clean(e)))}>Save SPDX</button>
          </div>
          {msg && <div className="notice">{msg}</div>}
          {err && <div className="notice error">{err}</div>}
        </div>
      </div>
    </Shell>
  )
}

function Shell(props: { onClose: () => void; tabs?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Security">
        <header className="sheet-head">
          <div className="sheet-title">Security</div>
          {props.tabs}
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {props.children}
      </div>
    </div>
  )
}

/**
 * Leaked secrets: trufflehog (AGPL-3.0, your own install, run as its own program) on the repo's history
 * or its files. Only a masked hint is shown; what to revoke and how to clean history, and a pre-push check.
 */
function Secrets(props: { project: string; sid?: string }) {
  const { project } = props
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.leak.state>> | null>(null)
  const [scan, setScan] = useState<LeakScan | null>(null)
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState<Leak | null>(null)
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof window.stm.leak.steps>> | null>(null)
  const [note, setNote] = useState('')
  const [confirmVerify, setConfirmVerify] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const load = () => void window.stm.leak.state(project).then((s) => (setSt(s), setScan((cur) => cur ?? s.scans.sort((a, b) => b.at - a.at)[0] ?? null)), (e) => setErr(clean(e)))
  useEffect(load, [project])
  useEffect(() => void (pick ? window.stm.leak.steps(pick).then(setPlan) : setPlan(null)), [pick?.fp])
  if (!st) return <div className="dsg-body faint">{err || 'Reading…'}</div>
  const run = (source: 'git' | 'filesystem') => (setBusy(true), setErr(''), void window.stm.leak.scan(project, source).then((s) => (setScan(s), setPick(null), load()), (e) => setErr(clean(e))).finally(() => setBusy(false)))
  const done = (l: Leak) => st.resolved[l.fp]
  return (
    <div className="cf-body">
      <div className="cf-col ob-list">
        <div className="faint">{st.trufflehog ? `trufflehog at ${st.trufflehog}. Your own repositories only. Found values are never stored or shown whole.` : 'trufflehog is not installed. On a Mac: brew install trufflehog.'}</div>
        <div className="ob-row">
          <button className="primary" disabled={busy || !st.trufflehog || !st.git} onClick={() => run('git')}>{busy ? 'Scanning…' : 'Scan git history'}</button>
          <button disabled={busy || !st.trufflehog} onClick={() => run('filesystem')}>Scan files</button>
        </div>
        {confirmVerify ? (
          <div className="notice ob-row">
            <span className="ob-grow">Checking a found key calls the provider with it. Only for your own keys.</span>
            <button className="primary" onClick={() => void window.stm.leak.verify(true).then(() => (setConfirmVerify(false), load()))}>Turn on</button>
            <button onClick={() => setConfirmVerify(false)}>Cancel</button>
          </div>
        ) : (
          <label className="check"><input type="checkbox" checked={st.verify} onChange={(e) => (e.target.checked ? setConfirmVerify(true) : void window.stm.leak.verify(false).then(load))} /> Check whether found keys still work (calls each provider)</label>
        )}
        {scan && <div className="faint">{scan.source === 'git' ? 'History' : 'Files'} scanned {when(scan.at)} in {(scan.ms / 1000).toFixed(1)} s, {scan.leaks.length} found{scan.verified ? ', checked live' : ''}.</div>}
        {scan?.leaks.map((l) => (
          <button key={l.fp} className={`ob-turn sec-f ${l === pick ? 'on' : ''} ${done(l) ? 'accepted' : ''}`} onClick={() => setPick(l)}>
            <span className="ob-turn-top"><span className="sec-id"><span className={`sec-sev wide ${l.verified ? 'critical' : l.verified === false ? 'low' : 'high'}`}>{l.verified ? 'Live' : l.verified === false ? 'Dead' : 'Unchecked'}</span>{l.detector}</span><span className="faint">{l.count > 1 ? `${l.count} places` : ''}</span></span>
            <span className="ob-turn-prompt faint">{done(l) ? 'Handled: ' : ''}{l.file}{l.line ? `:${l.line}` : ''}{l.commit ? ` in ${l.commit}` : ''}</span>
          </button>
        ))}
        {scan && !scan.leaks.length && <div className="notice">Nothing found.</div>}
      </div>
      <div className="cf-col">
        {pick ? (
          <>
            <div className="ob-head">
              <div className="ob-prompt">{pick.detector} key: <code>{pick.hint}</code></div>
              <div className="faint">{pick.file}{pick.line ? ` line ${pick.line}` : ''}{pick.commit ? `, commit ${pick.commit}` : ''}{pick.author ? ` by ${pick.author}` : ''}{pick.when ? `, ${pick.when}` : ''}</div>
            </div>
            <div className="ob-label">What to do</div>
            <ol className="leak-steps">{plan?.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            <div className="ob-row">
              {plan?.rotate && <a href={plan.rotate} target="_blank" rel="noreferrer">Open the {pick.detector} key page</a>}
              <button disabled={!props.sid} onClick={() => (window.dispatchEvent(new CustomEvent('stm:prefill', { detail: { sid: props.sid, text: `A ${pick.detector} key is hard-coded in ${pick.file}${pick.line ? ` line ${pick.line}` : ''}. Replace it with process.env.${plan?.vaultName ?? 'API_KEY'} (or this stack's way of reading the environment), add the name to .env.example without a value, and do not print or copy the key anywhere.` } })), setMsg('Put in the panel composer; read it and send.'))}>Remove it from the code in the panel</button>
            </div>
            <div className="ob-label">Mark as handled</div>
            {done(pick) ? (
              <div className="ob-row"><span className="ob-grow faint">{done(pick)!.note}, {when(done(pick)!.at)}</span><button onClick={() => void window.stm.leak.resolve(project, pick.fp, null).then(load)}>Undo</button></div>
            ) : (
              <div className="ob-row">
                <input className="ob-grow" placeholder="Such as: revoked and replaced on Oct 25" value={note} onChange={(e) => setNote(e.target.value)} />
                <button disabled={!note.trim()} onClick={() => void window.stm.leak.resolve(project, pick.fp, note).then(() => (setNote(''), load()))}>Mark</button>
              </div>
            )}
          </>
        ) : (
          <div className="faint">Pick a find to see what to revoke and how to take it out of history.</div>
        )}
        <div className="ob-label">Before each push</div>
        {st.git ? (
          st.hook === 'other' ? <div className="faint">This repo has its own pre-push hook; add the trufflehog check to it by hand.</div> : (
            <label className="check"><input type="checkbox" checked={st.hook === 'ours'} disabled={!st.trufflehog} onChange={(e) => void window.stm.leak.hook(project, e.target.checked).then(load, (x) => setErr(clean(x)))} /> Stop a push that carries a secret (a pre-push hook in this repo)</label>
          )
        ) : <div className="faint">Not a git repository.</div>}
        {msg && <div className="notice">{msg}</div>}
        {err && <div className="notice error">{err}</div>}
      </div>
    </div>
  )
}
