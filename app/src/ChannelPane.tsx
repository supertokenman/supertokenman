import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconClose } from './icons'
import { Select } from './ui'
import { channelSeen } from './channelOpen'
import type { ChannelPost, ChannelTeam, ChannelWake } from './bridge'
import type { PostKind } from '../shared/teamchannel'

const KINDS: PostKind[] = ['handoff', 'question', 'review', 'result', 'note']
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const msg = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

/** The team channel: posts of the lead, its workers and the person, with their wakes. Newest at the bottom. */
export default function ChannelPane(props: { team?: string; onClose: () => void }) {
  const [teams, setTeams] = useState<ChannelTeam[] | null>(null)
  const [teamId, setTeamId] = useState(props.team ?? '')
  const [posts, setPosts] = useState<ChannelPost[]>([])
  const [wakes, setWakes] = useState<Record<string, ChannelWake[]>>({})
  const [members, setMembers] = useState<ChannelTeam['members']>([])
  const [kind, setKind] = useState<'all' | PostKind>('all')
  const [who, setWho] = useState('')
  const [text, setText] = useState('')
  const [postKind, setPostKind] = useState<PostKind>('note')
  const [err, setErr] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    channelSeen(true)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      channelSeen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    void window.stm.channel.teams().then((t) => {
      setTeams(t)
      setTeamId((cur) => (cur && t.some((x) => x.id === cur) ? cur : (t[0]?.id ?? '')))
    }, (e) => setErr(msg(e)))
  }, [])
  const load = useCallback(() => {
    if (!teamId) return
    void window.stm.channel.list(teamId, { limit: 100 }).then((r) => {
      setPosts(r.posts)
      setWakes(r.wakes)
      setMembers(r.members)
    }, (e) => setErr(msg(e)))
  }, [teamId])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (!teamId) return
    return window.stm.channel.onPosted((t, v) => {
      if (t !== teamId) return
      if (v.pinned) return load()
      const p = v.post
      if (!p) return
      setPosts((xs) => (xs.some((x) => x.id === p.id) ? xs : [...xs, p]))
      if (v.wakes?.length) setWakes((w) => ({ ...w, [p.id]: v.wakes! }))
      channelSeen(true)
    })
  }, [teamId, load])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [posts.length])

  const shown = useMemo(() => posts.filter((p) => (kind === 'all' || p.kind === kind) && (!who || p.from === who)), [posts, kind, who])
  const team = teams?.find((t) => t.id === teamId)

  const send = () => {
    const t = text.trim()
    if (!t || !teamId) return
    window.stm.channel.post(teamId, { kind: postKind, text: t }).then(
      (r) => {
        setText('')
        setErr('')
        setPosts((xs) => (xs.some((x) => x.id === r.post.id) ? xs : [...xs, r.post]))
        setWakes((w) => ({ ...w, [r.post.id]: r.wakes }))
      },
      (e) => setErr(msg(e)),
    )
  }
  // @name completion: the word being typed after an @ offers the team's names
  const partial = /(?:^|\s)@([\w-]*)$/.exec(text)?.[1]
  const options = partial === undefined ? [] : members.filter((m) => m.handle.startsWith(partial.toLowerCase())).slice(0, 6)
  const complete = (handle: string) => {
    setText(text.replace(/@([\w-]*)$/, `@${handle} `))
    box.current?.focus()
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet team channel" role="dialog" aria-label="Team channel">
        <header className="sheet-head">
          <div className="sheet-title">Team channel</div>
          {teams && teams.length > 1 && (
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}
          {team && <span className="faint">{team.name}, {team.members.length} panels</span>}
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        {err && <div className="notice error team-err" role="alert">{err}</div>}
        {teams && !teams.length ? (
          <div className="sheet-body faint">No team yet. Make a panel the lead from its More menu and delegate to workers; the lead and its workers share this channel. It stays on this Mac.</div>
        ) : (
          <div className="chan-body">
            <div className="chan-filters" role="group" aria-label="Filter">
              {(['all', ...KINDS] as const).map((k) => (
                <button key={k} className="ghost small" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k}</button>
              ))}
              <Select value={who} onChange={(e) => setWho(e.target.value)} aria-label="From">
                <option value="">Everyone</option>
                <option value="you">You</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </div>
            <div className="chan-posts" role="log" aria-label="Posts">
              {!shown.length && <div className="faint chan-empty">{posts.length ? 'Nothing matches the filter.' : 'No posts yet. Delegating, asking and finishing tasks show up here, and you can post below.'}</div>}
              {shown.map((p) => (
                <article key={p.id} className={`chan-post${p.from === 'you' ? ' mine' : ''}${p.pinned ? ' pinned' : ''}`} data-kind={p.kind}>
                  <div className="chan-meta">
                    <b>{p.name}</b>
                    <span className="chan-kind">{p.kind}</span>
                    <span className="faint">{time(p.at)}</span>
                    {p.depth > 0 && <span className="faint">hand-off {p.depth}</span>}
                    <span className="spacer-flex" />
                    <button className="ghost small" aria-pressed={Boolean(p.pinned)} onClick={() => void window.stm.channel.pin(teamId, p.id, !p.pinned).catch((e) => setErr(msg(e)))}>{p.pinned ? 'Unpin' : 'Pin'}</button>
                  </div>
                  <div className="chan-text">{p.text}</div>
                  {(wakes[p.id] ?? []).map((w) => (
                    <div key={w.id} className={`chan-wake ${w.delivery}`}>
                      <span>{w.name}: {w.delivery === 'queued' ? (w.open ? 'waiting in its queue' : 'queued') : w.delivery === 'auto' ? 'woken' : 'not woken'}{w.why ? ` (${w.why})` : ''}</span>
                      {w.delivery === 'queued' && w.open && (
                        <button className="small" onClick={() => void window.stm.channel.sendNow(teamId, w.id).then(load, (e) => setErr(msg(e)))}>Send now</button>
                      )}
                    </div>
                  ))}
                </article>
              ))}
              <div ref={end} />
            </div>
            <div className="chan-compose">
              {options.length > 0 && (
                <div className="chan-complete" role="listbox" aria-label="Mention a panel">
                  {options.map((m) => <button key={m.id} role="option" aria-selected={false} className="ghost small" onMouseDown={(e) => (e.preventDefault(), complete(m.handle))}>@{m.handle}</button>)}
                </div>
              )}
              <textarea
                ref={box}
                rows={2}
                value={text}
                placeholder="Post to the team. @name wakes a panel; its message waits in that panel's queue until you press Send now."
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <Select value={postKind} onChange={(e) => setPostKind(e.target.value as PostKind)} aria-label="Kind of post">
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
              <button className="primary small" disabled={!text.trim() || !teamId} onClick={send}>Post</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
