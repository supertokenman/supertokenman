import { useEffect, useState } from 'react'
import type { CliState } from './bridge'

const mb = (n: number) => `${(n / 1048576).toFixed(0)} MB`

/** Where a CLI came from, for Settings: "Claude Code 2.1.308, downloaded". */
export function cliLabel(s: CliState | null): string {
  if (!s) return 'Claude Code: checking'
  if (s.phase === 'ready') return s.source === 'dev' ? 'Claude Code from node_modules (source build)' : `Claude Code ${s.version}, ${s.source === 'installed' ? 'installed on this computer' : s.source === 'bundled' ? 'bundled with the app' : 'downloaded by the app'}`
  if (s.phase === 'downloading') return `Claude Code ${s.version}: downloading`
  if (s.phase === 'failed') return `Claude Code ${s.version}: not set up (${s.message})`
  if (s.phase === 'unsupported') return s.message
  return 'Claude Code: set up when the first panel opens'
}

/** The CLI state, kept current. */
export function useCliState(): CliState | null {
  const [s, setS] = useState<CliState | null>(null)
  useEffect(() => {
    const cli = window.stm.claudeCli
    if (!cli) return
    void cli.state().then(setS, () => undefined)
    return cli.onState(setS)
  }, [])
  return s
}

/** First launch (or a release pinning a new Claude Code): what is downloaded, from where, with Cancel and Retry. */
export function CliSetup({ s }: { s: CliState }) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => setHidden(false), [s.phase])
  if (hidden || (s.phase !== 'downloading' && s.phase !== 'failed')) return null
  const pct = s.phase === 'downloading' && s.total ? Math.round((s.got / s.total) * 100) : undefined
  return (
    <div className="overlay">
      <div className="sheet cli-setup" role="dialog" aria-label="Setting up Claude Code">
        <header className="sheet-head"><div className="sheet-title">Setting up Claude Code</div></header>
        <div className="sheet-body">
          <p>Panels run Claude Code {s.version}, the exact build this version of SuperTokenMan was tested with. It is downloaded once from <b>{s.host}</b> and checked against the checksum pinned in the app.</p>
          {s.phase === 'downloading' && (
            <>
              <div className="cli-bar" role="progressbar" aria-valuenow={pct}><span style={{ width: `${pct ?? 5}%` }} /></div>
              <p className="faint">{mb(s.got)}{s.total ? ` of ${mb(s.total)}` : ''}</p>
              <button className="small" onClick={() => void window.stm.claudeCli.cancel()}>Cancel</button>
            </>
          )}
          {s.phase === 'failed' && (
            <>
              <p role="alert">Could not download Claude Code: {s.message} Panels open once it is set up.</p>
              <button className="small" onClick={() => void window.stm.claudeCli.retry()}>Retry</button>{' '}
              <button className="ghost small" onClick={() => setHidden(true)}>Later</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
