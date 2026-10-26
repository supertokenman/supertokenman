import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import type { Advice, CoolifyApp, Lint } from '../electron/deploys'
import type { DeployEvent } from './bridge'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'

const close = (
  <IconClose />
)
const LEVEL: Record<Lint['level'], { state: 'down' | 'warn' | 'off'; label: string }> = { ERROR: { state: 'down', label: 'Error' }, WARN: { state: 'warn', label: 'Warning' }, INFO: { state: 'off', label: 'Info' } }

/**
 * Deploys: what Supabase's advisors flag in each project, and Coolify's apps. A deploy is followed to
 * its end and the app is checked after it; when the check fails, the last good commit is offered to go
 * back to. Deploys and rollbacks run only when the person clicks, after a confirm.
 */
export function DeploysSheet(props: { onClose: () => void; onAsk: (text: string) => void }) {
  const [tab, setTab] = useState<'coolify' | 'dokploy' | 'supabase'>('coolify')
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet deploys" role="dialog" aria-label="Deploys">
        <header className="sheet-head">
          <div className="sheet-title">Deploys</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'coolify'} onClick={() => setTab('coolify')}>Coolify</button>
            <button role="tab" aria-selected={tab === 'dokploy'} onClick={() => setTab('dokploy')}>Dokploy</button>
            <button role="tab" aria-selected={tab === 'supabase'} onClick={() => setTab('supabase')}>Supabase advisors</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {tab === 'coolify' || tab === 'dokploy' ? <Target key={tab} kind={tab} /> : <Advisors onAsk={(t) => (props.onAsk(t), props.onClose())} />}
      </div>
    </div>
  )
}

const TARGETS = {
  coolify: { name: 'Coolify', placeholder: 'https://coolify.example.com', get: () => window.stm.deploys.coolify(), setUrl: (u: string) => window.stm.deploys.setUrl(u), deploy: (id: string) => window.stm.deploys.deploy(id), rollback: (id: string, to: string) => window.stm.deploys.rollback(id, to), token: 'an API token from Coolify (Keys & Tokens, with deploy permission)', rollbackWords: (to: string) => `Coolify is pointed at ${to.slice(0, 7)} and deploys it.`, note: 'A rollback points the app at an older commit and deploys it; set the commit back to HEAD in Coolify when the fix is in.' },
  dokploy: { name: 'Dokploy', placeholder: 'https://dokploy.example.com', get: () => window.stm.deploys.dokploy(), setUrl: (u: string) => window.stm.deploys.setDokployUrl(u), deploy: (id: string) => window.stm.deploys.dokployDeploy(id), rollback: (id: string, to: string) => window.stm.deploys.dokployRollback(id, to), token: 'an API key from Dokploy (Settings, Profile, API/CLI)', rollbackWords: () => 'Dokploy restores the image it kept from the last good deploy.', note: 'A rollback uses the rollbacks Dokploy keeps for the app; turn them on in the app settings in Dokploy for this to be offered.' },
} as const

function Target(props: { kind: keyof typeof TARGETS }) {
  const T = TARGETS[props.kind]
  const [data, setData] = useState<Awaited<ReturnType<typeof window.stm.deploys.coolify>> | null>(null)
  const [err, setErr] = useState('')
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<Record<string, DeployEvent[]>>({})
  const [confirm, setConfirm] = useState<{ app: CoolifyApp; kind: 'deploy' | 'rollback'; commit?: string } | null>(null)
  const load = () => void T.get().then((d) => (setData(d), setUrl(d.url), setErr('')), (e) => setErr(clean(e)))
  useEffect(() => {
    load()
    return window.stm.deploys.onEvent((e) => setEvents((m) => ({ ...m, [e.uuid]: [...(e.status === 'queued' ? [] : (m[e.uuid] ?? [])), e] })))
  }, [])
  const go = async () => {
    if (!confirm) return
    const c = confirm
    setConfirm(null)
    try {
      if (c.kind === 'deploy') await T.deploy(c.app.uuid)
      else await T.rollback(c.app.uuid, c.commit!)
    } catch (e) {
      setErr(clean(e))
    }
  }
  if (!data) return <div className="dep-body faint">{err || `Reading ${T.name}…`}</div>
  return (
    <div className="dep-body">
      <div className="dep-row">
        <label htmlFor="dep-url" className="sp-label">{T.name}</label>
        <input id="dep-url" value={url} placeholder={T.placeholder} onChange={(e) => setUrl(e.target.value)} />
        <button className="ghost small" onClick={() => void T.setUrl(url).then(load, (e) => setErr(clean(e)))}>Save</button>
        <button className="ghost small" onClick={load}>Refresh</button>
      </div>
      {data.missing && <div className="notice">Put {T.token} in the vault as {data.missing}.</div>}
      {err && <div className="notice error">{err}</div>}
      {data.apps.length === 0 && !data.missing && data.url && !err && <div className="faint">No applications in this {T.name}.</div>}
      <div className="dep-apps">
        {data.apps.map((a) => {
          const ev = events[a.uuid] ?? []
          const last = ev[ev.length - 1]
          const busy = last && last.stage !== 'done'
          const state = !last ? (/running|healthy|^done$/.test(a.status) ? 'up' : /exited|stopped|unhealthy|^error$/.test(a.status) ? 'down' : 'off') : busy ? 'busy' : last.ok ? 'up' : 'down'
          return (
            <div key={a.uuid} className={`dep-app ${state}`}>
              <div className="dep-top">
                <StateMark state={state as 'up'} label={a.status} />
                <b>{a.name}</b>
                <span className="faint">{a.branch ? `${a.branch} · ` : ''}{a.status}</span>
                <span className="spacer-flex" />
                <button className="primary small" disabled={Boolean(busy)} onClick={() => setConfirm({ app: a, kind: 'deploy' })}>{busy ? 'Deploying…' : 'Deploy'}</button>
              </div>
              <div className="dep-health">
                {a.fqdn ? <a href={a.fqdn} target="_blank" rel="noreferrer">{a.fqdn}</a> : <span className="faint">No address</span>}
                <label className="faint" htmlFor={`hp-${a.uuid}`}>checked at</label>
                <input id={`hp-${a.uuid}`} defaultValue={data.healthPaths[a.uuid] ?? ''} placeholder="/ (or /health)" onBlur={(e) => void window.stm.deploys.setHealth(a.uuid, e.target.value)} />
              </div>
              {ev.length > 0 && (
                <ol className="dep-steps">
                  {ev.map((e, i) => (
                    <li key={i} className={e.ok === false ? 'bad' : ''}>
                      <span className="dep-t">{new Date(e.at).toLocaleTimeString()}</span>
                      <span>{e.stage === 'health' ? `Checking ${e.url}` : e.stage === 'done' ? (e.note ?? (e.ok ? `Healthy: ${e.health?.tries.map((t) => t.status ?? 'no answer').join(', ')} in about ${e.health?.ms} ms` : `Check failed at ${e.url}: ${e.health?.tries.map((t) => t.status ?? t.error ?? 'no answer').join(', ')}`)) : `${e.stage === 'rollback' ? 'Rollback' : 'Deploy'}: ${e.status.replace('_', ' ')}${e.commit ? ` · ${e.commit.slice(0, 7)}` : ''}`}</span>
                    </li>
                  ))}
                </ol>
              )}
              {last?.stage === 'done' && last.ok === false && last.rollback && (
                <div className="dep-rollback" role="alert">
                  <span>The deploy went out but the app does not answer well. {props.kind === 'coolify' ? `Go back to ${last.rollback.slice(0, 7)}, the last commit that deployed well?` : 'Go back to the last deploy that went well?'}</span>
                  <button className="danger small" onClick={() => setConfirm({ app: a, kind: 'rollback', commit: last.rollback })}>Roll back…</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {confirm && (
        <div className="dep-confirm" role="alertdialog" aria-label="Confirm">
          <span>{confirm.kind === 'deploy' ? `Deploy ${confirm.app.name} now, from ${confirm.app.branch ?? 'its branch'}? It goes to production.` : `Roll ${confirm.app.name} back? ${T.rollbackWords(confirm.commit ?? '')}`}</span>
          <button className="ghost small" onClick={() => setConfirm(null)}>Cancel</button>
          <button className={confirm.kind === 'deploy' ? 'primary small' : 'danger small'} onClick={() => void go()}>{confirm.kind === 'deploy' ? 'Deploy' : 'Roll back'}</button>
        </div>
      )}
      <div className="faint dep-note">After a deploy the app is opened three times at its address; it counts as healthy when most answers are below 400. {T.note} Critical findings of a linked security scan stop a deploy.</div>
    </div>
  )
}

function Advisors(props: { onAsk: (text: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof window.stm.deploys.advisors>> | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.deploys.advisors().then(setData, (e) => setErr(clean(e))), [])
  if (err) return <div className="dep-body"><div className="notice error">{err}</div></div>
  if (!data) return <div className="dep-body faint">Asking Supabase…</div>
  if (data.missing) return <div className="dep-body"><div className="notice">Put a Supabase access token (Account, Access Tokens) in the vault as {data.missing}.</div></div>
  const Row = ({ p, l }: { p: Advice['project']; l: Lint }) => (
    <div className={`adv ${l.level.toLowerCase()}`}>
      <StateMark state={LEVEL[l.level].state} label={LEVEL[l.level].label} />
      <div className="adv-main">
        <b>{l.title}</b>
        <span className="faint">{l.detail || l.description}</span>
      </div>
      {l.remediation && <a className="ghost small" href={l.remediation} target="_blank" rel="noreferrer">How to fix</a>}
      <button className="ghost small" onClick={() => void window.stm.deploys.lintMessage(p, l).then(props.onAsk)}>Ask Claude to fix</button>
    </div>
  )
  return (
    <div className="dep-body">
      {data.projects.length === 0 && <div className="faint">No active projects.</div>}
      {data.projects.map((a) => (
        <section key={a.project.ref} className="adv-proj">
          <div className="sp-label">{a.project.name} · {a.security.length} security · {a.performance.length} performance</div>
          {a.error && <div className="notice error">{a.error}</div>}
          {a.security.length + a.performance.length === 0 && !a.error && <div className="faint">Nothing flagged.</div>}
          {[...a.security, ...a.performance].map((l, i) => <Row key={`${l.name}${i}`} p={a.project} l={l} />)}
        </section>
      ))}
    </div>
  )
}
