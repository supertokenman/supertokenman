import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean, friendly } from './errors'
import { threadsText, type Inbox, type PrDetail, type PrItem } from '../electron/prs'
import { Mark } from './CiView'
import { Markdown } from './markdown'

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}
const REVIEW: Record<string, string> = { APPROVED: 'approved', CHANGES_REQUESTED: 'asked for changes', COMMENTED: 'commented', DISMISSED: 'dismissed' }

/** The diff of one file, colored line by line, with its review comments under the lines they are on. */
function FileDiff({ d, path }: { d: PrDetail; path: string }) {
  const f = d.files.find((x) => x.path === path)!
  let line = 0
  return (
    <pre className="diff-body git-diff pr-diff">
      {f.patch ? f.patch.split('\n').map((l, i) => {
        const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
        if (h) line = Number(h[1]) - 1
        else if (!l.startsWith('-')) line++
        const here = !l.startsWith('-') && !h ? d.lineComments.filter((c) => c.path === path && c.line === line) : []
        return (
          <div key={i}>
            <div className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : h ? 'fold' : ''}>{l || ' '}</div>
            {here.map((c) => (
              <div key={c.id} className="pr-inline">
                <b>{c.author}</b> {c.body}
              </div>
            ))}
          </div>
        )
      }) : <span className="faint">Binary or too large to show.</span>}
    </pre>
  )
}

/** Pull requests that wait on you, and one in full with what you can do about it. */
export function PullRequests(props: { focusSid: string | null; onAsk: (text: string) => void; onClose: () => void }) {
  const [box, setBox] = useState<Inbox | null>(null)
  const [pick, setPick] = useState<PrItem | null>(null)
  const [d, setD] = useState<PrDetail | null>(null)
  const [tab, setTab] = useState<'conversation' | 'files' | 'checks'>('conversation')
  const [file, setFile] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [method, setMethod] = useState<'squash' | 'merge' | 'rebase'>('squash')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null)

  const load = async () => {
    try {
      const b = await window.stm.pr.inbox()
      setBox(b)
      if (!pick) setPick(b.review[0] ?? b.mine[0] ?? b.involved[0] ?? null)
    } catch (e) {
      setNote({ text: clean(e), bad: true })
    }
  }
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 60_000)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const open = async (p: PrItem) => {
    setPick(p)
    setD(null)
    setFile(null)
    setNote(null)
    try {
      const x = await window.stm.pr.detail(p.repo, p.number)
      setD(x)
      setFile(x.files[0]?.path ?? null)
    } catch (e) {
      setNote({ text: clean(e), bad: true })
    }
  }
  useEffect(() => {
    if (pick && (!d || d.repo !== pick.repo || d.number !== pick.number)) void open(pick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick])

  const act = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label)
    setNote(null)
    try {
      await fn()
      setNote({ text: done })
      setText('')
      if (pick) await open(pick)
    } catch (e) {
      setNote({ text: clean(e), bad: true })
    } finally {
      setBusy('')
    }
  }
  const ask = (t: string) => {
    props.onAsk(t)
    props.onClose()
  }

  const section = (title: string, list: PrItem[]) =>
    list.length > 0 && (
      <div className="pr-sec">
        <div className="pr-sec-head"><span className="group">{title}</span><span className="faint">{list.length}</span></div>
        {list.map((p) => (
          <button key={`${p.repo}#${p.number}`} className={`pr-item ${pick?.repo === p.repo && pick.number === p.number ? 'on' : ''}`} onClick={() => setPick(p)}>
            <span className="pr-title">{p.draft && <span className="pr-draft">Draft</span>}{p.title}</span>
            <span className="faint pr-meta">{p.repo.split('/')[1]} #{p.number} · {p.author} · {ago(p.updatedAt)}{p.comments ? ` · ${p.comments} comments` : ''}</span>
          </button>
        ))}
      </div>
    )

  const failing = d?.checks.filter((c) => c.conclusion === 'failure') ?? []
  const pending = d?.checks.filter((c) => c.status !== 'completed') ?? []
  const verdicts = d ? [...new Map(d.reviews.filter((r) => r.state !== 'COMMENTED').map((r) => [r.author, r.state])).entries()] : []

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet prs" role="dialog" aria-label="Pull requests">
        <header className="sheet-head">
          <div className="sheet-title">Pull requests</div>
          {box && box.review.length > 0 && <span className="badge accent">{box.review.length} to review</span>}
          <span className="spacer-flex" />
          <ForgePick onChange={() => void load()} />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        {!box && note?.bad ? (
          <div className="sheet-empty">
            <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><circle cx="16" cy="14" r="6" className="se-a" /><circle cx="16" cy="42" r="6" className="se-a" /><circle cx="40" cy="42" r="6" className="se-b" /><path d="M16 20v16M40 36V24a6 6 0 0 0-6-6h-8" className="se-line" /></svg>
            <div className="se-title">Pull requests need a forge</div>
            <div className="se-text">{friendly(note.text)}</div>
          </div>
        ) : (
        <div className="prs-body">
          <nav className="prs-list">
            {!box && !note && <div className="faint">Asking the forge...</div>}
            {box && !box.review.length && !box.mine.length && !box.involved.length && <div className="note">Nothing open waits on you.</div>}
            {box && section('Review requested', box.review)}
            {box && section('Yours', box.mine)}
            {box && section('Involving you', box.involved)}
          </nav>
          <section className="prs-detail">
            {note && <div className={`notice ${note.bad ? 'error' : ''}`}>{note.bad ? friendly(note.text) : note.text}</div>}
            {pick && !d && !note?.bad && <div className="faint">Loading #{pick.number}...</div>}
            {d && (
              <>
                <div className="pr-head">
                  <div className="pr-h1">{d.title} <span className="faint">#{d.number}</span></div>
                  <div className="pr-sub">
                    <span className={`pr-state ${d.merged ? 'merged' : d.draft ? 'draft' : d.state}`}>{d.merged ? 'Merged' : d.draft ? 'Draft' : d.state === 'open' ? 'Open' : 'Closed'}</span>
                    <span className="faint">{d.author} wants <code>{d.head}</code> into <code>{d.base}</code></span>
                    <span className="pr-size"><span className="add">+{d.additions}</span> <span className="del">−{d.deletions}</span></span>
                  </div>
                  <div className="pr-signals">
                    <span className={`pr-signal ${failing.length ? 'bad' : pending.length ? 'wait' : d.checks.length ? 'good' : ''}`}>
                      {d.checks.length === 0 ? 'No checks' : failing.length ? `${failing.length} check${failing.length > 1 ? 's' : ''} failing` : pending.length ? `${pending.length} running` : 'Checks pass'}
                    </span>
                    {verdicts.map(([who, st]) => <span key={who} className={`pr-signal ${st === 'APPROVED' ? 'good' : st === 'CHANGES_REQUESTED' ? 'bad' : ''}`}>{who} {REVIEW[st] ?? st.toLowerCase()}</span>)}
                    {d.state === 'open' && <span className={`pr-signal ${d.mergeable === false ? 'bad' : ''}`}>{d.mergeable === false ? 'Conflicts' : d.mergeState === 'clean' ? 'Ready to merge' : d.mergeState === 'blocked' ? 'Blocked by rules' : d.mergeState}</span>}
                  </div>
                </div>

                <div className="pr-tools">
                  <div className="segmented" role="tablist">
                    <button role="tab" aria-selected={tab === 'conversation'} onClick={() => setTab('conversation')}>Conversation</button>
                    <button role="tab" aria-selected={tab === 'files'} onClick={() => setTab('files')}>Files <span className="count">{d.files.length}</span></button>
                    <button role="tab" aria-selected={tab === 'checks'} onClick={() => setTab('checks')}>Checks</button>
                  </div>
                  <span className="spacer-flex" />
                  {props.focusSid && <button className="ghost small" disabled={!!busy} onClick={() => void act('checkout', () => window.stm.pr.checkout(props.focusSid!, d.repo, d.number), `Checked out pr/${d.number}`)}>Check out</button>}
                  <button className="ghost small" onClick={() => void window.stm.openUrl(d.url)}>Open in browser</button>
                </div>

                <div className="pr-scroll">
                  {tab === 'conversation' && (
                    <div className="pr-convo">
                      {d.body ? <div className="pr-card"><div className="pr-who">{d.author}</div><Markdown text={d.body} /></div> : <div className="faint">No description.</div>}
                      {[
                        ...d.comments.map((c) => ({ at: c.at, who: c.author, what: 'commented', body: c.body, path: '' })),
                        ...d.reviews.filter((r) => r.body || r.state !== 'COMMENTED').map((r) => ({ at: r.at, who: r.author, what: REVIEW[r.state] ?? r.state, body: r.body, path: '' })),
                        ...d.lineComments.filter((c) => !c.replyTo).map((c) => ({ at: c.at, who: c.author, what: 'on', body: c.body, path: `${c.path}${c.line ? `:${c.line}` : ''}` })),
                      ]
                        .sort((a, b) => a.at.localeCompare(b.at))
                        .map((e, i) => (
                          <div key={i} className={`pr-card ${e.what === 'approved' ? 'good' : e.what === 'asked for changes' ? 'bad' : ''}`}>
                            <div className="pr-who">{e.who} <span className="faint">{e.what} {e.path && <code>{e.path}</code>} · {ago(e.at)}</span></div>
                            {e.body && <Markdown text={e.body} />}
                          </div>
                        ))}
                    </div>
                  )}
                  {tab === 'files' && (
                    <div className="pr-files">
                      <div className="pr-file-list">
                        {d.files.map((f) => (
                          <button key={f.path} className={`pr-file ${file === f.path ? 'on' : ''}`} onClick={() => setFile(f.path)}>
                            <span className="pr-file-name">{f.path.split('/').pop()}</span>
                            <span className="pr-size"><span className="add">+{f.additions}</span> <span className="del">−{f.deletions}</span></span>
                          </button>
                        ))}
                      </div>
                      {file && <FileDiff d={d} path={file} />}
                    </div>
                  )}
                  {tab === 'checks' && (
                    <div className="pr-checks">
                      {d.checks.length === 0 && <div className="faint">No checks ran on {d.sha.slice(0, 7)}.</div>}
                      {d.checks.map((c, i) => (
                        <button key={i} className="pr-check" onClick={() => void window.stm.openUrl(c.url)}>
                          <Mark status={c.status} conclusion={c.conclusion} /> {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pr-compose">
                  <div className="pr-ask">
                    <button className="ghost small" onClick={() => ask(`Review pull request ${d.repo}#${d.number}, "${d.title}" (${d.head} into ${d.base}). Read the diff with git or gh, look for bugs, missing tests and risky changes, and give me findings ranked by severity with file and line.`)}>Ask Claude to review</button>
                    {d.lineComments.length > 0 && (
                      <button className="ghost small" onClick={() => ask(`Address the review comments on ${d.repo}#${d.number} (branch ${d.head}). Check out the branch if needed, make the changes, and run the checks before saying it is done.\n\n${threadsText(d)}`)}>Ask Claude to address comments</button>
                    )}
                    {failing.length > 0 && <button className="ghost small" onClick={() => ask(`Checks are failing on ${d.repo}#${d.number} (branch ${d.head}): ${failing.map((c) => c.name).join(', ')}. Find the cause and fix it on that branch. Run the same check locally before you say it is fixed.`)}>Ask Claude to fix checks</button>}
                  </div>
                  {d.state === 'open' && !d.merged && (
                    <>
                      <textarea placeholder="Leave a comment or a review" value={text} onChange={(e) => setText(e.target.value)} />
                      <div className="pr-buttons">
                        <button className="ghost small" disabled={!!busy || !text.trim()} onClick={() => void act('comment', () => window.stm.pr.comment(d.repo, d.number, text), 'Commented')}>Comment</button>
                        <button className="ghost small" disabled={!!busy || !text.trim()} onClick={() => void act('changes', () => window.stm.pr.review(d.repo, d.number, 'REQUEST_CHANGES', text), 'Asked for changes')}>Request changes</button>
                        <button className="small" disabled={!!busy} onClick={() => void act('approve', () => window.stm.pr.review(d.repo, d.number, 'APPROVE', text), 'Approved')}>Approve</button>
                        <span className="spacer-flex" />
                        <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} aria-label="Merge method">
                          <option value="squash">Squash</option>
                          <option value="merge">Merge commit</option>
                          <option value="rebase">Rebase</option>
                        </select>
                        <button className="primary small" disabled={!!busy || d.draft || d.mergeable === false} onClick={() => confirm(`Merge #${d.number} into ${d.base}?`) && void act('merge', () => window.stm.pr.merge(d.repo, d.number, method), 'Merged')}>
                          {busy === 'merge' ? 'Merging...' : 'Merge'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
        )}
      </div>
    </div>
  )
}

/** Phase 111: which forge the inbox reads, GitHub or a Gitea / Forgejo at an address. */
function ForgePick(props: { onChange: () => void }) {
  const [f, setF] = useState<{ kind: 'github' | 'gitea'; url: string; hasToken: boolean } | null>(null)
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.forge.get().then((x) => (setF(x), setUrl(x.url))), [])
  if (!f) return null
  const set = (kind: 'github' | 'gitea', u = url) => void window.stm.forge.set(kind, u).then((x) => (setF(x), setErr(''), props.onChange()), (e) => setErr(String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  return (
    <span className="forge-pick">
      <span className="segmented" role="tablist">
        <button role="tab" aria-selected={f.kind === 'github'} onClick={() => set('github')}>GitHub</button>
        <button role="tab" aria-selected={f.kind === 'gitea'} onClick={() => url && set('gitea')}>Gitea</button>
      </span>
      <input value={url} placeholder="https://git.example.com" spellCheck={false} aria-label="Gitea address" onChange={(e) => setUrl(e.target.value)} onBlur={() => f.kind === 'gitea' && set('gitea')} onKeyDown={(e) => e.key === 'Enter' && set('gitea')} />
      {f.kind === 'gitea' && !f.hasToken && <span className="faint">add GITEA_TOKEN to the vault</span>}
      {err && <span className="bg-err">{err}</span>}
    </span>
  )
}
