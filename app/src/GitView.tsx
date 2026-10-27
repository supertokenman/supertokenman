import { useCallback, useEffect, useState } from 'react'
import { clean, friendly } from './errors'
import type { FileChange, Laid, Status } from '../electron/git'
import { Checkbox, Select } from './ui'

const LANE = 14
const ROW = 30
const COLORS = ['var(--accent)', 'var(--blue)', 'var(--green)', 'var(--gold)', 'var(--red)', 'var(--muted)']
const color = (lane: number) => COLORS[lane % COLORS.length]!

const LETTER: Record<string, string> = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', U: 'conflict', '?': 'new' }

/** A unified diff, colored line by line. */
function UnifiedDiff({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode)/.test(l))
  return (
    <pre className="diff-body git-diff">
      {lines.map((l, i) => (
        <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'fold' : ''}>
          {l || ' '}
        </div>
      ))}
    </pre>
  )
}

/** One row of the history: its lanes drawn as an SVG strip, then the commit. */
function GraphRow({ c, width }: { c: Laid; width: number }) {
  const x = (lane: number) => LANE / 2 + lane * LANE
  return (
    <div className="git-commit">
      <svg width={width} height={ROW} className="git-lanes" aria-hidden="true">
        {c.lines.map((l, i) => (
          <path key={i} d={`M${x(l.from)} ${l.from === c.lane ? ROW / 2 : 0} C${x(l.from)} ${ROW * 0.8} ${x(l.to)} ${ROW * 0.7} ${x(l.to)} ${ROW}`} stroke={color(l.to)} strokeWidth="1.6" fill="none" />
        ))}
        <path d={`M${x(c.lane)} 0 V${ROW / 2}`} stroke={color(c.lane)} strokeWidth="1.6" />
        <circle cx={x(c.lane)} cy={ROW / 2} r={c.parents.length > 1 ? 4.5 : 3.5} fill={c.parents.length > 1 ? 'var(--bg)' : color(c.lane)} stroke={color(c.lane)} strokeWidth="1.8" />
      </svg>
      <span className="git-subject">
        {c.refs.map((r) => (
          <span key={r} className={`git-ref ${r.startsWith('HEAD') ? 'head' : r.startsWith('tag:') ? 'tag' : r.includes('/') ? 'remote' : ''}`}>
            {r.replace('HEAD -> ', '')}
          </span>
        ))}
        {c.subject}
      </span>
      <span className="faint git-meta">{c.author} · {c.when}</span>
    </div>
  )
}

/** The panel's git: branch, sync, changes to stage, the commit, and the history. */
export function GitView({ sid, active }: { sid: string; active: boolean }) {
  const [st, setSt] = useState<Status | null>(null)
  const [branches, setBranches] = useState<{ name: string; current: boolean }[]>([])
  const [history, setHistory] = useState<Laid[]>([])
  const [picked, setPicked] = useState<{ f: FileChange; staged: boolean; text: string } | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, b, h] = await Promise.all([window.stm.git('status', sid), window.stm.git('branches', sid), window.stm.git('log', sid)])
      setSt(s)
      setBranches(b)
      setHistory(h)
    } catch (e) {
      setNote({ text: clean(e), bad: true })
    }
  }, [sid])
  useEffect(() => {
    if (!active) return
    void refresh()
    const t = setInterval(() => void refresh(), 5000)
    return () => clearInterval(t)
  }, [active, refresh])

  const act = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label)
    setNote(null)
    try {
      const out = await fn()
      if (done) setNote({ text: done })
      await refresh()
      return out
    } catch (e) {
      setNote({ text: clean(e), bad: true })
    } finally {
      setBusy('')
    }
  }
  const open = async (f: FileChange, staged: boolean) => {
    if (picked && picked.f.path === f.path && picked.staged === staged) return setPicked(null)
    setPicked({ f, staged, text: await window.stm.git('diff', sid, f.path, staged, f.untracked) })
  }

  if (!st) return <div className="note">{note?.text ?? 'Reading the repository...'}</div>
  const stagedFiles = st.files.filter((f) => f.staged !== '.' && !f.untracked)
  const changed = st.files.filter((f) => f.unstaged !== '.' || f.untracked)
  const width = Math.max(1, ...history.map((c) => Math.max(c.lane, ...c.lines.map((l) => Math.max(l.from, l.to))) + 1)) * LANE

  const row = (f: FileChange, staged: boolean) => {
    const letter = f.untracked ? '?' : staged ? f.staged : f.unstaged
    return (
      <div key={`${staged}-${f.path}`} className={`git-file ${picked?.f.path === f.path && picked.staged === staged ? 'on' : ''}`}>
        <Checkbox checked={staged} onChange={() => void act('stage', () => window.stm.git(staged ? 'unstage' : 'stage', sid, [f.path]))} aria-label={staged ? 'Unstage' : 'Stage'} />
        <button className="git-path" onClick={() => void open(f, staged)}>
          <span className={`git-letter l-${letter}`} data-tip={LETTER[letter] ?? letter}>{letter === '?' ? 'N' : letter}</span>
          <span className="git-dir">{f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''}</span>
          {f.path.split('/').pop()}
        </button>
      </div>
    )
  }

  return (
    <div className="git">
      <div className="git-bar">
        <label className="select">
          <span className="select-label">Branch</span>
          <Select value={st.branch} onChange={(e) => void act('switch', () => window.stm.git('checkout', sid, e.target.value), `Switched to ${e.target.value}`)}>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </Select>
        </label>
        {st.upstream ? (
          <span className="git-sync" data-tip={`Tracking ${st.upstream}`}>
            <span className={st.behind ? 'warn' : ''}>↓{st.behind}</span>
            <span className={st.ahead ? 'up' : ''}>↑{st.ahead}</span>
          </span>
        ) : (
          <span className="faint">not pushed yet</span>
        )}
        <span className="spacer-flex" />
        <button className="ghost small" disabled={!!busy} onClick={() => void act('pull', () => window.stm.git('pull', sid), 'Pulled')}>{busy === 'pull' ? 'Pulling...' : 'Pull'}</button>
        <button className="small" disabled={!!busy} onClick={() => void act('push', () => window.stm.git('push', sid), 'Pushed')}>{busy === 'push' ? 'Pushing...' : st.upstream ? 'Push' : 'Publish branch'}</button>
      </div>
      {note && <div className={`notice ${note.bad ? 'error' : ''}`}>{note.bad ? friendly(note.text) : note.text}</div>}

      <div className="git-group">
        <span className="group">Staged <span className="faint">{stagedFiles.length}</span></span>
        {stagedFiles.length > 0 && <button className="ghost small" onClick={() => void act('stage', () => window.stm.git('unstage', sid, stagedFiles.map((f) => f.path)))}>Unstage all</button>}
      </div>
      {stagedFiles.map((f) => row(f, true))}
      <div className="git-group">
        <span className="group">Changes <span className="faint">{changed.length}</span></span>
        {changed.length > 0 && <button className="ghost small" onClick={() => void act('stage', () => window.stm.git('stage', sid, changed.map((f) => f.path)))}>Stage all</button>}
      </div>
      {changed.length === 0 && stagedFiles.length === 0 && <div className="faint">Working tree clean.</div>}
      {changed.map((f) => row(f, false))}
      {picked && <UnifiedDiff text={picked.text} />}

      <div className="git-commit-box">
        <textarea
          placeholder={stagedFiles.length ? 'Commit message' : 'Stage changes to commit'}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void act('commit', () => window.stm.git('commit', sid, msg), 'Committed').then(() => setMsg(''))
            }
          }}
        />
        <div className="git-commit-actions">
          <button className="ghost small" disabled={!stagedFiles.length || !!busy} data-tip="Ask Haiku for a message from the staged diff" onClick={async () => {
            const m = await act('suggest', () => window.stm.git('suggest', sid))
            if (typeof m === 'string' && m) setMsg(m)
          }}>
            {busy === 'suggest' ? 'Writing...' : 'Suggest'}
          </button>
          <button className="primary small" disabled={!stagedFiles.length || !msg.trim() || !!busy} onClick={() => void act('commit', () => window.stm.git('commit', sid, msg), 'Committed').then(() => setMsg(''))}>
            Commit {stagedFiles.length ? `${stagedFiles.length} file${stagedFiles.length === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </div>

      <div className="git-group"><span className="group">History</span></div>
      <div className="git-history">
        {history.map((c) => (
          <GraphRow key={c.sha} c={c} width={width} />
        ))}
      </div>
    </div>
  )
}
