import { useEffect, useState } from 'react'
import { criteriaOf, specOf, type Issue } from '../shared/issuespec'
import type { InjectionFinding } from '../shared/injection'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { IconBranch, IconClose, IconExternal } from './icons'
import './bridge'

type Row = Awaited<ReturnType<typeof window.stm.issue.list>>['issues'][number]
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} d ago`
}

/**
 * A panel from an issue: the open issues of the focused project's GitHub repository. Starting one opens a
 * panel in its own worktree, writes the issue as the spec there and sends the first message. Nothing is
 * pushed or posted to GitHub.
 */
export function IssuesSheet(props: { cwd?: string; onClose: () => void; onStart: (repo: string, issue: Issue) => Promise<void> }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof window.stm.issue.list>> | null>(null)
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<number | null>(null)
  const [full, setFull] = useState<{ issue: Issue; slug: string; flags: InjectionFinding[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (props.cwd) void window.stm.issue.list(props.cwd).then((l) => (setList(l), setPick(l.issues[0]?.number ?? null)), (e) => setErr(clean(e)))
  }, [props.cwd])
  useEffect(() => {
    setFull(null)
    if (list && pick !== null) void window.stm.issue.get(list.repo, pick).then(setFull, (e) => setErr(clean(e)))
  }, [list?.repo, pick])
  const shown = (list?.issues ?? []).filter((i) => !q || `#${i.number} ${i.title} ${i.labels.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  const start = async () => {
    if (!list || !full) return
    setBusy(true)
    setErr('')
    try {
      await props.onStart(list.repo, full.issue)
      props.onClose()
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe ps is" role="dialog" aria-label="Panel from an issue">
        <header className="sheet-head">
          <div className="sheet-title">Panel from an issue</div>
          <span className="faint">{list ? `${list.repo} · ${list.issues.length} open` : ''}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        {!props.cwd ? <div className="dsg-body"><div className="faint">Focus a panel on a GitHub project first.</div></div> : (
          <>
            <div className="ps-bar"><input autoFocus placeholder="Filter by number, title or label" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter issues" /></div>
            <div className="ps-body">
              <div className="ps-list" role="listbox" aria-label="Open issues">
                {!list && !err && <div className="faint ps-empty"><StateMark state="busy" label="Loading" /> Reading the open issues…</div>}
                {list && !shown.length && <div className="faint ps-empty">No open issue matches.</div>}
                {shown.map((i) => (
                  <button key={i.number} role="option" aria-selected={i.number === pick} className={`ps-hit ${i.number === pick ? 'on' : ''}`} onClick={() => setPick(i.number)}>
                    <span className="ps-meta"><b>#{i.number}</b>{i.labels.slice(0, 3).map((l) => <span key={l} className="is-label">{l}</span>)}<span className="ps-when">{ago(i.updated)}</span></span>
                    <span className="ps-prompt">{i.title}</span>
                    <span className="ps-reply faint">{i.author}{i.comments ? ` · ${i.comments} comments` : ''}{i.assignee ? ` · assigned to ${i.assignee}` : ''}</span>
                  </button>
                ))}
              </div>
              <div className="ps-preview">
                {!full ? (pick !== null && !err ? <div className="faint"><StateMark state="busy" label="Reading" /> Reading the issue…</div> : <div className="faint">Pick an issue.</div>) : (
                  <>
                    <div className="ps-preview-head">
                      <span className="fld-label">#{full.issue.number} becomes a spec</span>
                      <span className="spacer-flex" />
                      <a className="is-link" href={full.issue.url} onClick={(e) => (e.preventDefault(), void window.stm.openUrl(full.issue.url))}><IconExternal />GitHub</a>
                      <button className="primary small" disabled={busy} onClick={() => void start()}>{busy ? <StateMark state="busy" label="Starting" /> : <IconBranch />}Start a panel on it</button>
                    </div>
                    {full.flags.length > 0 && <div className="notice error">The issue has text that reads like instructions to an AI ({full.flags.map((f) => f.rule).join(', ')}). It goes into the spec quoted, as material, and the panel is told not to follow it. Read it before starting.</div>}
                    <div className="faint">A panel opens in its own worktree on a new branch stm/{full.slug}-…, with docs/specs/{full.slug}/spec.md written there. Acceptance criteria found: {criteriaOf(full.issue.body).length || 'none (two general ones are used)'}.</div>
                    <pre className="ob-pre is-spec">{list ? specOf(full.issue, list.repo) : ''}</pre>
                  </>
                )}
                {err && <div className="notice error">{err}</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
