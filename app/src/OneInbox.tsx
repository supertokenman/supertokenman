import { useEffect, useMemo, useState } from 'react'
import { IconClose, IconEdit, IconTrash } from './icons'
import { RowAct, RowActs } from './RowActs'
import { ALL_VIEW, applyView, counts, expand, matchShortcut, snoozeChoices, variables, within, type Conversation, type Hours, type SavedReply, type Source, type Status, type View } from '../shared/inbox'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'

type Data = Awaited<ReturnType<typeof window.stm.inbox.load>>
const SRC: Record<Source, string> = { outlook: 'Outlook', gmail: 'Gmail', bluesky: 'Bluesky', mastodon: 'Mastodon', rocketchat: 'Rocket.Chat' }
const STATUSES: Status[] = ['open', 'pending', 'snoozed', 'done']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const when = (iso: string) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: '2-digit', month: 'short' })
}

/**
 * One inbox: mail and mentions as conversations to triage. Open, pending (answered, waiting on them),
 * snoozed (until a time or their reply) and done; saved replies with /shortcuts and variables; private
 * notes; labels and saved views. Replies are drafts until Send.
 */
export function InboxSheet(props: { onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<View>(ALL_VIEW)
  const [pick, setPick] = useState<string | null>(null)
  const [tab, setTab] = useState<'list' | 'replies' | 'hours' | 'team'>('list')
  const load = async () => {
    setBusy(true)
    try {
      setData(await window.stm.inbox.load())
      setErr('')
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
  }
  useEffect(() => void load(), [])
  const shown = useMemo(() => (data ? applyView(data.list, view) : []), [data, view])
  const c = data?.list.find((x) => x.key === pick) ?? null
  const n = data ? counts(data.list) : null
  const act = (p: Promise<unknown>) => void p.then(load, (e) => setErr(clean(e)))
  const none = data && !Object.values(data.connected).some(Boolean)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet inbox1 observe" role="dialog" aria-label="Inbox">
        <header className="sheet-head">
          <div className="sheet-title">Inbox</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'list'} onClick={() => setTab('list')}>Conversations{n ? ` · ${n.open} open` : ''}</button>
            <button role="tab" aria-selected={tab === 'replies'} onClick={() => setTab('replies')}>Saved replies</button>
            <button role="tab" aria-selected={tab === 'hours'} onClick={() => setTab('hours')}>Business hours</button>
            <button role="tab" aria-selected={tab === 'team'} onClick={() => setTab('team')}>Team chat</button>
          </div>
          <span className="spacer-flex" />
          {data && data.hours.on && <span className={`ib-hours ${within(data.hours, new Date()) ? 'in' : 'out'}`}>{within(data.hours, new Date()) ? 'In hours' : 'Outside hours'}</span>}
          <button className="ghost small" disabled={busy} onClick={() => void load()}>{busy ? 'Refreshing…' : 'Refresh'}</button>
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        {err && <div className="notice error ib-notice">{err}</div>}
        {data?.errors.map((e) => <div key={e.source} className="notice error ib-notice">{SRC[e.source]}: {e.error}</div>)}
        {none && <div className="notice ib-notice">Connect Outlook or Gmail (Mail) and Bluesky or Mastodon (Social) to fill this inbox.</div>}
        {data && tab === 'list' && (
          <div className="ib-body">
            <aside className="ib-side">
              <div className="sp-label">Status</div>
              {STATUSES.map((s) => (
                <button key={s} className={`ib-filter ${view.statuses.length === 1 && view.statuses[0] === s ? 'on' : ''}`} onClick={() => setView({ ...view, name: '', statuses: [s] })}>
                  <span>{s[0]!.toUpperCase() + s.slice(1)}</span><span className="ib-n">{n?.[s as keyof typeof n] ?? 0}</span>
                </button>
              ))}
              <div className="sp-label">Sources</div>
              {(Object.keys(SRC) as Source[]).filter((s) => data.connected[s]).map((s) => (
                <label key={s} className="ib-check"><input type="checkbox" checked={!view.sources.length || view.sources.includes(s)} onChange={(e) => {
                  const all = (Object.keys(SRC) as Source[]).filter((x) => data.connected[x])
                  const cur = view.sources.length ? view.sources : all
                  const next = e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)
                  setView({ ...view, name: '', sources: next.length === all.length ? [] : next })
                }} />{SRC[s]}</label>
              ))}
              <div className="sp-label">Labels</div>
              {[...new Set(data.list.flatMap((x) => x.labels))].sort().map((l) => (
                <label key={l} className="ib-check"><input type="checkbox" checked={view.labels.includes(l)} onChange={(e) => setView({ ...view, name: '', labels: e.target.checked ? [...view.labels, l] : view.labels.filter((x) => x !== l) })} />{l}</label>
              ))}
              <div className="sp-label">Saved views</div>
              {data.views.map((v) => (
                <div key={v.name} className="ib-view">
                  <button className={`ib-filter ${view.name === v.name ? 'on' : ''}`} onClick={() => setView(v)}>{v.name}</button>
                  <button className="ib-x" aria-label={`Delete ${v.name}`} onClick={() => act(window.stm.inbox.views(data.views.filter((x) => x.name !== v.name)))}>×</button>
                </div>
              ))}
              <SaveView view={view} onSave={(name) => act(window.stm.inbox.views([...data.views.filter((x) => x.name !== name), { ...view, name }]).then(() => setView({ ...view, name })))} />
            </aside>
            <div className="ib-list">
              <input className="ib-search" id="ib-search" value={view.text} placeholder="Search names, subjects, text, notes" onChange={(e) => setView({ ...view, name: '', text: e.target.value })} />
              {shown.length === 0 && <div className="faint ib-empty">Nothing here.</div>}
              {shown.map((x) => (
                <button key={x.key} className={`ib-row ${x.key === pick ? 'on' : ''} ${x.unread ? 'unread' : ''}`} onClick={() => setPick(x.key)}>
                  <span className={`ib-src ${x.source}`}>{SRC[x.source]}</span>
                  <span className="ib-who">{x.from.name || x.from.handle}</span>
                  <span className="ib-when">{when(x.at)}</span>
                  <span className="ib-subj">{x.subject ? <b>{x.subject} </b> : null}<span className="faint">{x.text}</span></span>
                  <span className="ib-meta">
                    {x.status !== 'open' && <span className={`ib-st ${x.status}`}>{x.status}{x.status === 'snoozed' ? (x.untilReply ? ' until reply' : x.until ? ` to ${new Date(x.until).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : '') : ''}</span>}
                    {x.labels.map((l) => <span key={l} className="dc-tag">{l}</span>)}
                    {x.notes.length > 0 && <span className="ib-notes">{x.notes.length} note{x.notes.length === 1 ? '' : 's'}</span>}
                  </span>
                </button>
              ))}
            </div>
            {c ? <Thread key={c.key} c={c} data={data} act={act} /> : <div className="ib-thread faint ib-empty">Pick a conversation.</div>}
          </div>
        )}
        {data && tab === 'replies' && <Replies replies={data.replies} act={act} />}
        {data && tab === 'hours' && <HoursForm hours={data.hours} act={act} />}
        {tab === 'team' && <TeamChat onChange={() => void load()} />}
      </div>
    </div>
  )
}

function SaveView(props: { view: View; onSave: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="ib-saveview">
      <input id="ib-viewname" value={name} placeholder="Save this filter as…" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && (props.onSave(name.trim()), setName(''))} />
    </div>
  )
}

function Thread(props: { c: Conversation; data: Data; act: (p: Promise<unknown>) => void }) {
  const { c, data } = props
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [label, setLabel] = useState('')
  const [snooze, setSnooze] = useState(false)
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const [sending, setSending] = useState(false)
  const vars = variables(c, data.me || 'me')
  const matches = matchShortcut(text, data.replies)
  const use = (r: SavedReply) => setText(expand(r.text, vars))
  const outside = data.hours.on && !within(data.hours, new Date())
  const isMail = c.source === 'outlook' || c.source === 'gmail'
  const [approve, setApprove] = useState(false)
  return (
    <div className="ib-thread">
      <div className="ib-th-head">
        <div className="ib-th-title">
          <b>{c.subject || `${SRC[c.source]} mention`}</b>
          <span className="faint">{c.from.name} {c.from.handle && c.from.handle !== c.from.name ? `· ${c.from.handle}` : ''} · {new Date(c.at).toLocaleString()}</span>
        </div>
        <div className="ib-actions">
          {c.status !== 'done' && <button className="ghost small" onClick={() => props.act(window.stm.inbox.status(c.key, 'done'))}>Done</button>}
          {c.status !== 'open' && <button className="ghost small" onClick={() => props.act(window.stm.inbox.status(c.key, 'open'))}>Reopen</button>}
          {c.status === 'open' && <button className="ghost small" onClick={() => props.act(window.stm.inbox.status(c.key, 'pending'))}>Pending</button>}
          <button className="ghost small" aria-expanded={snooze} onClick={() => setSnooze(!snooze)}>Snooze…</button>
        </div>
      </div>
      {snooze && (
        <div className="ib-snooze">
          {snoozeChoices(data.hours, new Date()).map((s) => <button key={s.label} className="ghost small" onClick={() => (setSnooze(false), props.act(window.stm.inbox.status(c.key, 'snoozed', { until: s.until })))}>{s.label}</button>)}
          <button className="ghost small" onClick={() => (setSnooze(false), props.act(window.stm.inbox.status(c.key, 'snoozed', { untilReply: true })))}>Until they reply</button>
        </div>
      )}
      <div className="ib-msg">{c.text}</div>
      {c.url && <a className="faint ib-link" href={c.url} target="_blank" rel="noreferrer">Open on {SRC[c.source]}</a>}
      <div className="ib-labels">
        {c.labels.map((l) => <button key={l} className="dc-tag on" onClick={() => props.act(window.stm.inbox.labels(c.key, c.labels.filter((x) => x !== l)))}>{l} ×</button>)}
        <input id="ib-label" value={label} placeholder="add a label" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && label.trim() && (props.act(window.stm.inbox.labels(c.key, [...c.labels, label])), setLabel(''))} />
      </div>
      {c.notes.length > 0 && (
        <div className="ib-notelist">
          {c.notes.map((x) => (
            <div key={x.at} className="ib-note">
              <span className="ib-note-tag">Private note</span>
              <span>{x.text}</span>
              <button className="ib-x" aria-label="Delete note" onClick={() => props.act(window.stm.inbox.note(c.key, '', x.at))}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="ib-compose">
        <div className="ib-compose-head">
          <span className="sp-label">Reply{isMail ? ' by mail' : ` on ${SRC[c.source]}`}</span>
          <span className="spacer-flex" />
          {data.replies.length > 0 && <button className="ghost small" onClick={() => void window.stm.inbox.suggest(c.key).then((s) => {
            const r = data.replies.find((x) => x.shortcut === s)
            if (r) (use(r), setMsg({ t: `Suggested /${r.shortcut}. Read it before sending.` }))
            else setMsg({ t: 'No saved reply fits this one.' })
          }, (e) => setMsg({ t: clean(e), bad: true }))}>Suggest a saved reply</button>}
        </div>
        <textarea id="ib-reply" value={text} placeholder="Type / for saved replies" onChange={(e) => (setText(e.target.value), setApprove(false))} rows={5} />
        {matches.length > 0 && (
          <div className="ib-matches" role="listbox" aria-label="Saved replies">
            {matches.map((r) => <button key={r.shortcut} role="option" onClick={() => use(r)}><code>/{r.shortcut}</code><span className="faint">{expand(r.text, vars).slice(0, 90)}</span></button>)}
          </div>
        )}
        {msg && <div className={`faint ${msg.bad ? 'ib-bad' : ''}`}>{msg.t}</div>}
        {approve && c.source === 'rocketchat' && <div className="notice">Goes to {c.subject?.replace(/ \(mention\)$/, '')}{c.thread.split('/')[1] !== c.thread.split('/')[0] ? ', in the thread' : ''} as you, exactly as written above. {c.subject?.startsWith('@') ? 'Only they see it.' : 'Everyone in that room can read it.'}</div>}
        {outside && <div className="faint">Outside your business hours: it still sends now if you press Send.</div>}
        <div className="ib-compose-foot">
          <input id="ib-note" value={note} placeholder="Private note (never sent)" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && note.trim() && (props.act(window.stm.inbox.note(c.key, note)), setNote(''))} />
          <button className="ghost small" disabled={!note.trim()} onClick={() => (props.act(window.stm.inbox.note(c.key, note)), setNote(''))}>Add note</button>
          {c.source === 'rocketchat' && !approve ? <button className="primary small" disabled={!text.trim() || sending} onClick={() => setApprove(true)}>Review and send</button> : null}
          {c.source === 'rocketchat' && approve && <button className="ghost small" onClick={() => setApprove(false)}>Back</button>}
          {(c.source !== 'rocketchat' || approve) && <button className="primary small" disabled={!text.trim() || sending} onClick={() => {
            setApprove(false)
            setSending(true)
            void window.stm.inbox.send(c.key, text).then(() => (setText(''), setMsg({ t: 'Sent. The conversation is pending until they answer.' }), props.act(Promise.resolve())), (e) => setMsg({ t: clean(e), bad: true })).finally(() => setSending(false))
          }}>{sending ? <><StateMark state="busy" label="Sending" /> Sending…</> : c.source === 'rocketchat' ? `Approve: post in ${c.subject?.replace(/ \(mention\)$/, '') ?? 'the room'}` : 'Send'}</button>}
        </div>
      </div>
    </div>
  )
}

function Replies(props: { replies: SavedReply[]; act: (p: Promise<unknown>) => void }) {
  const [r, setR] = useState<SavedReply>({ shortcut: '', text: '' })
  return (
    <div className="dsg-body">
      <div className="faint">Type /shortcut in a reply. Variables: {'{{name}}'}, {'{{first_name}}'}, {'{{handle}}'}, {'{{subject}}'}, {'{{my_name}}'}. A variable left unfilled blocks Send.</div>
      <div className="wr-rules">
        {props.replies.map((x) => (
          <div key={x.shortcut} className="wr-rule row-host">
            <code>/{x.shortcut}</code>
            <span className="ib-reply-text">{x.text}</span>
            <RowActs>
              <RowAct label={`Edit /${x.shortcut}`} icon={<IconEdit />} onClick={() => setR(x)} />
              <RowAct label={`Remove /${x.shortcut}`} icon={<IconTrash />} danger onClick={() => props.act(window.stm.inbox.replies(props.replies.filter((y) => y.shortcut !== x.shortcut)))} />
            </RowActs>
          </div>
        ))}
      </div>
      <div className="ib-reply-form">
        <input id="ib-shortcut" value={r.shortcut} placeholder="shortcut, e.g. thanks" onChange={(e) => setR({ ...r, shortcut: e.target.value.replace(/^\//, '') })} />
        <textarea id="ib-replytext" value={r.text} placeholder="Oi {{first_name}}, obrigado pelo retorno! …" rows={3} onChange={(e) => setR({ ...r, text: e.target.value })} />
        <button className="primary small" disabled={!r.shortcut || !r.text.trim()} onClick={() => (props.act(window.stm.inbox.replies([...props.replies.filter((y) => y.shortcut !== r.shortcut), r])), setR({ shortcut: '', text: '' }))}>Save reply</button>
      </div>
    </div>
  )
}

function HoursForm(props: { hours: Hours; act: (p: Promise<unknown>) => void }) {
  const [h, setH] = useState(props.hours)
  return (
    <div className="dsg-body">
      <label className="ib-check"><input type="checkbox" checked={h.on} onChange={(e) => setH({ ...h, on: e.target.checked })} />Use business hours</label>
      <div className="ib-days">
        {DAYS.map((d, i) => <button key={d} className={`ib-day ${h.days.includes(i) ? 'on' : ''}`} aria-pressed={h.days.includes(i)} disabled={!h.on} onClick={() => setH({ ...h, days: h.days.includes(i) ? h.days.filter((x) => x !== i) : [...h.days, i].sort() })}>{d}</button>)}
      </div>
      <div className="dep-row ib-times">
        <label className="faint" htmlFor="ib-start">From</label>
        <input id="ib-start" type="time" value={h.start} disabled={!h.on} onChange={(e) => setH({ ...h, start: e.target.value })} />
        <label className="faint" htmlFor="ib-end">to</label>
        <input id="ib-end" type="time" value={h.end} disabled={!h.on} onChange={(e) => setH({ ...h, end: e.target.value })} />
        <span className="spacer-flex" />
        <button className="primary small" onClick={() => props.act(window.stm.inbox.hours(h))}>Save</button>
      </div>
      <div className="faint">Snooze choices land inside these hours; triggers marked "Only in business hours" wait for them; the inbox says when you are outside them. Nothing is ever sent on its own.</div>
    </div>
  )
}

/** Team chat: your Rocket.Chat server, its direct messages and mentions in this inbox, and an alert channel. */
function TeamChat(props: { onChange: () => void }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.rc.get>> | null>(null)
  const [url, setUrl] = useState('')
  const [user, setUser] = useState('')
  const [token, setToken] = useState('')
  const [room, setRoom] = useState('')
  const [al, setAl] = useState<{ turns?: boolean; ci?: boolean }>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const load = () => void window.stm.rc.get().then((r) => (setSt(r), setUrl(r.config?.url ?? ''), setRoom(r.config?.alertRoom ?? ''), setAl(r.config?.alerts ?? {})))
  useEffect(load, [])
  const run = (p: Promise<unknown>, ok: string) => (setBusy(true), setMsg(null), void p.then(() => (setMsg({ t: ok }), load(), props.onChange()), (e) => setMsg({ t: clean(e), bad: true })).finally(() => setBusy(false)))
  return (
    <div className="ib-team">
      <div className="faint">Your own Rocket.Chat server. Direct messages and messages that mention you come into the inbox; a reply goes out only after you approve it. Create a personal access token in Rocket.Chat (My Account, Personal Access Tokens): it and your user id stay in the vault.</div>
      <div className="fld-grid">
        <label className="fld wide"><span className="fld-label">Server</span><input value={url} placeholder="https://chat.yourteam.dev" onChange={(e) => setUrl(e.target.value)} /></label>
        <label className="fld"><span className="fld-label">User id</span><input value={user} placeholder={st?.connected ? 'kept in the vault' : ''} onChange={(e) => setUser(e.target.value)} /></label>
        <label className="fld"><span className="fld-label">Personal access token</span><input type="password" value={token} placeholder={st?.connected ? 'kept in the vault' : ''} onChange={(e) => setToken(e.target.value)} /></label>
      </div>
      <div className="ob-row">
        {st?.connected && <span className="ib-ok"><StateMark state="up" label="Connected" /> Connected to {st.config?.url}</span>}
        <span className="spacer-flex" />
        {st?.connected && <button className="ghost small" disabled={busy} onClick={() => run(window.stm.rc.disconnect(), 'Disconnected; the token left the vault.')}>Disconnect</button>}
        <button className="primary small" disabled={busy || !url || (!st?.connected && (!user || !token))} onClick={() => run(window.stm.rc.connect(url, user, token).then((m) => (setToken(''), setUser(''), m)), 'Connected.')}>{st?.connected ? 'Save' : 'Connect'}</button>
      </div>
      {st?.connected && (
        <>
          <div className="sp-label">Alerts to a channel</div>
          <div className="faint">Only the kinds you turn on, one line each, to the channel you name. Send a test line first.</div>
          <div className="fld-grid">
            <label className="fld"><span className="fld-label">Channel</span><input value={room} placeholder="#alerts" onChange={(e) => setRoom(e.target.value)} /></label>
            <div className="fld"><span className="fld-label">Kinds</span>
              <label className="check"><input type="checkbox" checked={!!al.turns} onChange={(e) => setAl({ ...al, turns: e.target.checked })} /> A panel finished while you were away</label>
              <label className="check"><input type="checkbox" checked={!!al.ci} onChange={(e) => setAl({ ...al, ci: e.target.checked })} /> CI failed on a panel's branch</label>
            </div>
          </div>
          <div className="ob-row">
            <span className="spacer-flex" />
            <button className="small" disabled={busy || !st.config?.alertRoom} onClick={() => run(window.stm.rc.test(), `Test line sent to ${st.config?.alertRoom}.`)}>Send a test line</button>
            <button className="primary small" disabled={busy} onClick={() => run(window.stm.rc.alerts(room, al), 'Alerts saved.')}>Save alerts</button>
          </div>
        </>
      )}
      {msg && <div className={msg.bad ? 'notice error' : 'notice'}>{msg.t}</div>}
    </div>
  )
}
