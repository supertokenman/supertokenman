import { useEffect, useRef, useState } from 'react'
import { IconClose } from './icons'
import { friendly } from './errors'
import { decodeInvite, encodeInvite, newInvite, TeamRoom, type Entry, type Invite, type Member } from './teamRoom'

const KEY = 'stm.team'
type Saved = { name: string; id: string; relay: string; invite?: string }
const load = (): Saved => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Saved>
    return { name: s.name ?? '', id: s.id ?? `m-${crypto.randomUUID().slice(0, 12)}`, relay: s.relay ?? '', invite: s.invite }
  } catch {
    return { name: '', id: `m-${crypto.randomUUID().slice(0, 12)}`, relay: '' }
  }
}
const store = (s: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage off: the room lasts this session
  }
}

/** The room connection lives with the app, not the sheet: it keeps running while the sheet is closed. */
export function useTeam(presence: () => { repo?: string; branch?: string; status?: string }) {
  const [saved, setSaved] = useState(load)
  const [entries, setEntries] = useState<Entry[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [state, setState] = useState<{ s: 'off' | 'connecting' | 'live' | 'offline'; why?: string }>({ s: 'off' })
  const [unread, setUnread] = useState(0)
  const room = useRef<TeamRoom | null>(null)
  const presenceRef = useRef(presence)
  presenceRef.current = presence

  useEffect(() => {
    if (!saved.invite || !saved.name) return
    let inv: Invite
    try {
      inv = decodeInvite(saved.invite)
    } catch {
      return
    }
    setEntries([])
    const r = new TeamRoom(inv, { id: saved.id, name: saved.name }, {
      onEntry: (e) => {
        setEntries((xs) => (xs.some((x) => x.at === e.at && x.from === e.from) ? xs : [...xs, e].slice(-300)))
        if (e.from !== saved.id) setUnread((n) => n + 1)
      },
      onMembers: setMembers,
      onState: (s, why) => setState({ s, why }),
    }, () => presenceRef.current())
    room.current = r
    void r.connect()
    return () => {
      r.close()
      room.current = null
      setState({ s: 'off' })
      setMembers([])
    }
  }, [saved.invite, saved.name, saved.id])

  const update = (s: Saved) => {
    setSaved(s)
    store(s)
  }
  return { saved, update, entries, members, state, unread, clearUnread: () => setUnread(0), room }
}

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
/** A member's mark: a shape and a hue from their id, the same on every machine. */
function Mark({ id, name, live }: { id: string; name: string; live?: boolean }) {
  const h = hue(id)
  const shape = h % 3
  const fill = `hsl(${h} 55% 58%)`
  return (
    <span className={`team-mark ${live ? 'live' : ''}`} title={name}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        {shape === 0 ? <circle cx="14" cy="14" r="11" fill={fill} /> : shape === 1 ? <rect x="4" y="4" width="20" height="20" rx="3" fill={fill} /> : <path d="M14 3 25 24H3z" fill={fill} />}
        <text x="14" y="18.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#111">{name.slice(0, 1).toUpperCase()}</text>
      </svg>
    </span>
  )
}
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function TeamSheet(props: {
  team: ReturnType<typeof useTeam>
  handoffFrom: () => { title: string; text: string; repo?: string; branch?: string } | null
  onContinue: (text: string) => void
  onClose: () => void
}) {
  const { team } = props
  const { saved } = team
  const [name, setName] = useState(saved.name)
  const [relay, setRelay] = useState(saved.relay)
  const [paste, setPaste] = useState('')
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    team.clearUnread()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
    team.clearUnread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.entries.length])

  const create = () => {
    if (!name.trim()) return setErr('Your name first.')
    if (!/^https?:\/\//.test(relay.trim())) return setErr('The relay address, like https://stm-team-relay.you.workers.dev')
    team.update({ ...saved, name: name.trim(), relay: relay.trim(), invite: encodeInvite(newInvite(relay.trim())) })
    setErr('')
  }
  const join = () => {
    if (!name.trim()) return setErr('Your name first.')
    try {
      const i = decodeInvite(paste)
      team.update({ ...saved, name: name.trim(), relay: i.relay, invite: paste.trim() })
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const send = async (fn: () => Promise<void>) => {
    try {
      await fn()
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const inRoom = !!saved.invite
  const live = team.state.s === 'live'
  const others = team.members.filter((m) => m.id !== saved.id && Date.now() - m.at < 70_000)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet team" role="dialog" aria-label="Team">
        <header className="sheet-head">
          <div className="sheet-title">Team</div>
          {inRoom && <span className={`team-state ${team.state.s}`}>{live ? `${others.length + 1} here` : team.state.s === 'connecting' ? 'Connecting' : team.state.why ?? 'Offline'}</span>}
          <span className="spacer-flex" />
          {inRoom && (
            <>
              <button className="ghost small" onClick={() => { void navigator.clipboard.writeText(saved.invite!); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied' : 'Copy invite'}</button>
              <button className="ghost small" onClick={() => team.update({ ...saved, invite: undefined })}>Leave</button>
            </>
          )}
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        {err && <div className="notice error team-err">{friendly(err)}</div>}

        {!inRoom ? (
          <div className="sheet-body team-start">
            <label className="team-field">Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="How the team sees you" /></label>
            <div className="team-ways">
              <div className="team-way">
                <svg className="team-glyph" viewBox="0 0 64 40" aria-hidden="true"><circle cx="16" cy="20" r="12" /><rect x="36" y="8" width="24" height="24" rx="3" /><path d="M28 20h8" /></svg>
                <b>Start a room</b>
                <input value={relay} onChange={(e) => setRelay(e.target.value)} placeholder="https://stm-team-relay.you.workers.dev" spellCheck={false} />
                <button className="primary small" onClick={create}>Create and copy invite</button>
                <span className="faint">Deploy the relay once on your Cloudflare: <code>cd app/team-relay && npm i && npx wrangler deploy</code></span>
              </div>
              <div className="team-way">
                <svg className="team-glyph" viewBox="0 0 64 40" aria-hidden="true"><path d="M8 20h30M30 12l8 8-8 8" /><rect x="42" y="8" width="16" height="24" rx="3" /></svg>
                <b>Join with an invite</b>
                <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="stm-team:..." spellCheck={false} />
                <button className="small" onClick={join}>Join</button>
                <span className="faint">Messages are locked with a key that is only in the invite. The relay sees ciphertext.</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="team-body">
            <aside className="team-people">
              <div className="team-person me">
                <Mark id={saved.id} name={saved.name} live={live} />
                <span><b>{saved.name}</b><span className="faint">you</span></span>
              </div>
              {others.map((m) => (
                <div key={m.id} className="team-person">
                  <Mark id={m.id} name={m.name} live />
                  <span>
                    <b>{m.name}</b>
                    <span className="faint">{m.repo ? `${m.repo}${m.branch ? ` · ${m.branch}` : ''}` : 'no panel open'}</span>
                  </span>
                  {m.status && <span className={`team-dot ${m.status}`} title={m.status} />}
                </div>
              ))}
              {live && others.length === 0 && <div className="faint team-alone">Nobody else here yet. Send them the invite.</div>}
            </aside>
            <section className="team-feed">
              <div className="team-entries">
                {team.entries.map((e, i) => {
                  const mine = e.from === saved.id
                  if (e.note.kind === 'chat')
                    return (
                      <div key={i} className={`team-msg ${mine ? 'mine' : ''}`}>
                        {!mine && <Mark id={e.from} name={e.note.name} />}
                        <div><span className="faint team-meta">{mine ? '' : `${e.note.name} · `}{time(e.at)}</span><div className="team-bubble">{e.note.text}</div></div>
                      </div>
                    )
                  if (e.note.kind === 'handoff') {
                    const n = e.note
                    return (
                      <div key={i} className="team-handoff">
                        <div className="team-handoff-head"><span className="team-tag">Hand-off</span><b>{n.title}</b><span className="faint">{n.name} · {time(e.at)}</span></div>
                        {(n.repo || n.branch) && <div className="faint team-where">{n.repo}{n.branch ? ` · ${n.branch}` : ''}</div>}
                        <pre className="team-handoff-text">{n.text}</pre>
                        {!mine && (
                          <button className="small" onClick={() => { props.onContinue(`${n.name} handed this off to me: "${n.title}"${n.repo ? ` in ${n.repo}${n.branch ? ` on ${n.branch}` : ''}` : ''}.\n\n${n.text}\n\nRead the current state of the code first, then tell me what is left and continue.`); props.onClose() }}>
                            Continue in my panel
                          </button>
                        )}
                      </div>
                    )
                  }
                  return null
                })}
                <div ref={end} />
              </div>
              <form className="team-compose" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send(async () => { await team.room.current!.send({ kind: 'chat', name: saved.name, text: text.trim() }); setText('') }) }}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder={live ? 'Message the room' : 'Waiting for the relay...'} disabled={!live} />
                <button className="ghost small" type="button" disabled={!live} title="Send the focused panel's last answer as a hand-off" onClick={() => {
                  const h = props.handoffFrom()
                  if (!h) return setErr('Focus a panel with an answer to hand off.')
                  void send(() => team.room.current!.send({ kind: 'handoff', name: saved.name, ...h }))
                }}>Hand off my panel</button>
                <button className="small" disabled={!live || !text.trim()}>Send</button>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
