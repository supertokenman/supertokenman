import { useEffect, useState } from 'react'
import { StateMark } from './StateMark'
import { clean, friendly } from './errors'
import { IconRefresh, IconClose } from './icons'
import type { ProviderResult, RepoSecrets } from '../electron/cloud'
import { cloudWatchOn, setCloudWatch } from './cloudWatch'
import { daysSince, forgotten, summary } from './cloudView'
import { Checkbox } from './ui'

const HOW: Record<string, string> = {
  aws: 'brew install awscli && aws configure',
  gcloud: 'brew install --cask google-cloud-sdk && gcloud auth login',
  doctl: 'brew install doctl && doctl auth init',
  flyctl: 'brew install flyctl && fly auth login',
  docker: 'Docker Desktop, OrbStack or colima',
  SUPABASE_ACCESS_TOKEN: 'Connections, Vault: SUPABASE_ACCESS_TOKEN',
  NEON_API_KEY: 'Connections, Vault: NEON_API_KEY',
}

/** What is running in your accounts and for how long, and what secrets each repository holds (names only). */
export function CloudSheet({ onClose }: { onClose: () => void }) {
  const [res, setRes] = useState<ProviderResult[] | null>(null)
  const [repos, setRepos] = useState<RepoSecrets[] | null>(null)
  const [repoErr, setRepoErr] = useState('')
  const [copied, setCopied] = useState('')
  const [scanning, setScanning] = useState(false)
  const [watching, setWatching] = useState(cloudWatchOn)
  const scan = () => {
    setScanning(true)
    void window.stm.cloud.scan().then(setRes, () => setRes([])).finally(() => setScanning(false))
  }
  useEffect(() => {
    scan()
    window.stm.cloud.repoSecrets().then(setRepos, (e) => setRepoErr(clean(e)))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const sum = res ? summary(res) : null
  const all = (res ?? []).flatMap((p) => p.resources).sort((a, b) => Number(forgotten(b)) - Number(forgotten(a)) || (daysSince(b.since) ?? -1) - (daysSince(a.since) ?? -1))
  const maxDays = Math.max(30, ...all.map((r) => daysSince(r.since) ?? 0))
  const copy = (cmd: string) => {
    void navigator.clipboard.writeText(cmd)
    setCopied(cmd)
    setTimeout(() => setCopied(''), 1500)
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet cloud" role="dialog" aria-label="Cloud">
        <header className="sheet-head">
          <div className="sheet-title">Cloud</div>
          <span className="faint">What is running in your accounts. Read-only, with the logins already on this Mac.</span>
          <span className="spacer-flex" />
          <label className="faint cloud-watch" data-tip="Off by default: the clouds are asked only when this sheet is open">
            <span className="switch">
              <Checkbox checked={watching} onChange={(e) => (setCloudWatch(e.target.checked), setWatching(e.target.checked))} />
              <span />
            </span>
            Check every 6 hours
          </label>
          <button className="icon" data-tip="Check again" aria-label="Check again" onClick={scan} disabled={scanning}>{res && !scanning ? <IconRefresh /> : <span className="spinner" />}</button>
          <button className="icon" aria-label="Close" onClick={onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body cl">
          {!res && <div className="faint"><span className="spinner" /> Asking AWS, Google Cloud, DigitalOcean, Fly.io, Supabase and Neon...</div>}
          {sum && (
            <div className="sc-hero">
              <span className="hl-big"><b className={sum.running ? 'warn' : ''}>{sum.running}</b>running</span>
              <span className="hl-big"><b className={sum.forgotten ? 'hot' : ''}>{sum.forgotten}</b>running 2+ weeks</span>
              <span className="hl-big"><b>{sum.stopped}</b>stopped (disks still bill)</span>
              <span className="hl-big"><b>{sum.connected}</b>accounts read</span>
            </div>
          )}
          {res && (
            <section className="sc-sec">
              <div className="cl-providers">
                {res.map((p) => (
                  <span key={p.provider} className={`cl-prov ${p.missing ? 'off' : p.error ? 'bad' : 'on'}`} data-tip={p.missing ? `Not connected. ${HOW[p.missing] ?? p.missing}` : p.error ?? `${p.resources.length} found`}>
                    <i />{p.provider}{!p.missing && !p.error ? <b>{p.resources.length}</b> : null}
                  </span>
                ))}
              </div>
              {res.filter((p) => p.error).map((p) => <div key={p.provider} className="notice error">{friendly(`${p.provider}: ${p.error}`)}</div>)}
            </section>
          )}
          {res && all.length === 0 && <div className="note">Nothing running in the accounts this Mac can read.</div>}
          {all.length > 0 && (
            <section className="sc-sec">
              <div className="sc-sub">Running and stopped</div>
              {all.map((r, i) => {
                const d = daysSince(r.since)
                const old = forgotten(r)
                return (
                  <div key={`${r.provider}-${r.name}-${i}`} className={`cl-row ${r.state} ${old ? 'old' : ''}`}>
                    <StateMark state={r.state === 'running' ? 'up' : r.state === 'stopped' ? 'warn' : 'off'} label={r.state} />
                    <span className="cl-name"><b>{r.name}</b><span className="faint">{r.provider} · {r.kind}{r.size ? ` · ${r.size}` : ''} · {r.region}</span></span>
                    <span className="cl-age" data-tip={d === null ? 'start date unknown' : `${d} days`} role="img" aria-label={d === null ? 'start date unknown' : `${d} days`}>
                      <span style={{ width: `${d === null ? 0 : Math.max(2, (Math.log1p(d) / Math.log1p(maxDays)) * 100)}%` }} />
                    </span>
                    <span className="cl-days">{d === null ? '' : d < 1 ? 'today' : `${d}d`}</span>
                    <span className="cl-act">
                      {r.stop && <button className="ghost small" data-tip={r.stop} onClick={() => copy(r.stop!)}>{copied === r.stop ? 'Copied' : 'Copy stop'}</button>}
                      {r.console && <button className="small" onClick={() => void window.stm.openUrl(r.console)}>Console</button>}
                    </span>
                  </div>
                )
              })}
              <p className="faint sc-fine">Nothing is stopped from here: copy the command or open the console. Stopped VMs and databases still bill their disks; delete what you no longer need.</p>
            </section>
          )}

          <section className="sc-sec">
            <div className="sc-sub">Secrets in your GitHub repositories (names only)</div>
            {repoErr && <div className="notice error">{friendly(repoErr)}</div>}
            {!repos && !repoErr && <div className="faint"><span className="spinner" /> Reading repositories...</div>}
            {repos && (
              <div className="cl-repos">
                {repos.filter((r) => r.secrets.length).map((r) => (
                  <div key={r.repo} className="cl-repo">
                    <button className="cl-repo-name" onClick={() => void window.stm.openUrl(`https://github.com/${r.repo}/settings/secrets/actions`)}>{r.repo}</button>
                    <span className="cl-secrets">
                      {r.secrets.map((s) => {
                        const d = daysSince(s.updatedAt) ?? 0
                        return <span key={s.scope + s.name} className={`cl-secret ${d > 365 ? 'stale' : ''}`} data-tip={`${s.scope}, updated ${d} days ago`}>{s.name}<i>{d > 365 ? `${(d / 365).toFixed(1)}y` : `${d}d`}</i></span>
                      })}
                    </span>
                  </div>
                ))}
                {repos.every((r) => !r.secrets.length) && <div className="note">No Actions secrets in your repositories.</div>}
                <p className="faint sc-fine">GitHub returns names and dates, never values. Secrets untouched for a year are worth rotating, and deleting where the repository is dead.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
