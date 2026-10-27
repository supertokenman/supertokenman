import { Steps } from './Steps'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconClose } from './icons'
import type { Folder, MailItem, MailMessage } from '../electron/mail/outlook'
import type { Account } from '../electron/mail/service'
import { clean } from './errors'
import { IntegrationMark } from './IntegrationMark'
import { mailDoc } from './mailDoc'

type Status = Awaited<ReturnType<typeof window.stm.mail.status>>

const when = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
/** A steady color per sender, from the app's own palette. */
const hue = (s: string) => ['#d97757', '#6a9bcc', '#9fc48a', '#c9a227', '#b07cc6', '#5fb3a1'][[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 6]

/**
 * Outlook in the app's own interface: folders, the list, the message, reply and compose. Mail comes
 * from Microsoft Graph through the main process; an email's HTML shows in a sandbox without scripts,
 * with remote images off until asked.
 */
export function MailSheet(props: { onClose: () => void; onUnread?: (n: number) => void }) {
  const [st, setSt] = useState<Status | null>(null)
  const [acct, setAcct] = useState<Account>('outlook')
  const [counts, setCounts] = useState<Partial<Record<Account, number>>>({})
  const [folder, setFolder] = useState<Folder>('inbox')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<MailItem[]>([])
  const [next, setNext] = useState<string | undefined>()
  const [sel, setSel] = useState<string | null>(null)
  const [msg, setMsg] = useState<MailMessage | null>(null)
  const [images, setImages] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [reply, setReply] = useState<{ all: boolean; text: string } | null>(null)
  const [compose, setCompose] = useState<{ to: string; cc: string; subject: string; text: string } | null>(null)
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const on = Boolean(st?.accounts[acct].connected)

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setErr('')
    setBusy(name)
    try {
      await fn()
    } catch (e) {
      setErr(clean(e))
    }
    setBusy('')
  }
  const load = useCallback(
    async (more = false) => {
      const page = await window.stm.mail.list(acct, folder, search || undefined, more ? next : undefined)
      setItems((old) => (more ? [...old, ...page.items] : page.items))
      setNext(page.next)
      if (folder === 'inbox' && !search) {
        const n = await window.stm.mail.unread(acct)
        setCounts((c) => ({ ...c, [acct]: n }))
      }
    },
    [acct, folder, search, next],
  )
  useEffect(() => {
    void window.stm.mail.status().then((s) => {
      setSt(s)
      // open on a connected account
      if (!s.accounts.outlook.connected && s.accounts.gmail.connected) setAcct('gmail')
    })
  }, [])
  // the menu's badge: every connected inbox together
  useEffect(() => {
    props.onUnread?.(Object.values(counts).reduce((a, b) => a + (b ?? 0), 0))
  }, [counts, props])
  useEffect(() => {
    if (!on) return
    setItems([])
    setSel(null)
    setMsg(null)
    void act('list', () => load(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, acct, folder, search])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !compose && !reply && props.onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [props, compose, reply])

  const open = (it: MailItem) =>
    act('open', async () => {
      setSel(it.id)
      setReply(null)
      setCompose(null)
      setImages(false)
      setMsg(await window.stm.mail.get(acct, it.id))
      if (!it.read) {
        await window.stm.mail.markRead(acct, it.id, true)
        setItems((l) => l.map((x) => (x.id === it.id ? { ...x, read: true } : x)))
        if (folder === 'inbox') setCounts((c) => ({ ...c, [acct]: Math.max(0, (c[acct] ?? 1) - 1) }))
      }
    })
  const moveTo = (to: Folder) =>
    msg &&
    act(to, async () => {
      await window.stm.mail.move(acct, msg.id, to)
      const i = items.findIndex((x) => x.id === msg.id)
      const rest = items.filter((x) => x.id !== msg.id)
      setItems(rest)
      setMsg(null)
      const after = rest[i] ?? rest[i - 1]
      if (after) void open(after)
    })
  const doc = useMemo(() => (msg ? mailDoc(msg.html, images) : null), [msg, images])
  const listRef = useRef<HTMLDivElement>(null)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet mail" role="dialog" aria-label="Mail">
        <header className="sheet-head">
          <div className="sheet-title">Mail</div>
          <span className="faint">{st?.accounts[acct].account?.address ?? 'Outlook and Gmail, in this app'}</span>
          <span className="spacer-flex" />
          {on && (
            <>
              <form className="mail-search" onSubmit={(e) => (e.preventDefault(), setSearch(q.trim()))}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.75" /><path d="m10.5 10.5 3.25 3.25" /></svg>
                <input value={q} placeholder="Search mail" onChange={(e) => (setQ(e.target.value), e.target.value === '' && setSearch(''))} />
              </form>
              <button className="primary small" onClick={() => (setCompose({ to: '', cc: '', subject: '', text: '' }), setReply(null))}>New message</button>
            </>
          )}
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        {err && <div className="notice error mail-err">{err}</div>}

        {st && !on && (
          <div className="mail-body setup">
            <AccountNav st={st} acct={acct} counts={counts} pick={(a) => (setAcct(a), setFolder('inbox'), setSearch(''), setQ(''))} />
          <div className="mail-setup">
            {acct === 'outlook' ? (
            <div className="mail-setup-card">
              <Steps
                title="Connect Outlook"
                steps={[
                  { id: 'open', text: <>Open App registrations, choose <b>New registration</b>.</>, why: 'Your mail and calendar stay with Microsoft; this app reads them through Microsoft Graph, with Microsoft’s own sign-in. This one free app entry lets that sign-in know this app. A personal account may be asked to create a free Azure account first.', open: { url: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade' } },
                  { id: 'name', text: <>Name it <b>SuperTokenMan</b>. Accounts: <b>any organizational directory and personal Microsoft accounts</b>.</> },
                  { id: 'redirect', text: <>Redirect URI, platform <b>Public client/native (mobile and desktop)</b>:</>, copy: st.redirect },
                  { id: 'id', text: <>Register, then paste the <b>Application (client) ID</b>.</>, fields: [{ value: clientId, set: setClientId, placeholder: 'Application (client) ID' }] },
                  {
                    id: 'sign',
                    text: 'Sign in with Microsoft.',
                    why: 'Permissions asked: read and send your mail, read your calendar, your name and address.',
                    done: false,
                    action: (
                      <button className="primary small" disabled={!clientId.trim() || Boolean(busy)} onClick={() => void act('connect', async () => (await window.stm.mail.connect('outlook', clientId), setSt(await window.stm.mail.status())))}>
                        {busy === 'connect' ? <span className="spinner" /> : 'Sign in with Microsoft'}
                      </button>
                    ),
                  },
                ]}
                footer={<span>Tokens stay encrypted in this Mac’s keychain. The window and Claude never see them.</span>}
              />
            </div>
            ) : (
            <div className="mail-setup-card">
              <Steps
                title="Connect Gmail"
                steps={[
                  { id: 'apis', text: <>Create a Google Cloud project, enable the <b>Gmail API</b> and <b>Google Calendar API</b>.</>, why: 'Your mail and calendar stay with Google; this app reads them through Google’s APIs, with Google’s own sign-in. This one free OAuth client lets that sign-in know this app.', open: { url: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com' } },
                  { id: 'consent', text: <>Consent screen: <b>External</b>, add yourself under <b>Test users</b>.</>, why: 'While the app is in testing, Google asks you to sign in again every 7 days.', open: { url: 'https://console.cloud.google.com/auth/overview' } },
                  { id: 'client', text: <><b>Create OAuth client ID</b>, type <b>Desktop app</b>. Its redirect is this Mac:</>, copy: st.googleRedirect, open: { url: 'https://console.cloud.google.com/apis/credentials' } },
                  { id: 'keys', text: <>Paste the <b>client ID</b> and <b>client secret</b>.</>, fields: [{ value: clientId, set: setClientId, placeholder: 'Client ID (…apps.googleusercontent.com)' }, { value: secret, set: setSecret, placeholder: 'Client secret', secret: true }] },
                  {
                    id: 'sign',
                    text: 'Sign in with Google.',
                    why: 'Permissions asked: read, label and send your mail, read your calendar, your address.',
                    done: false,
                    action: (
                      <button className="primary small" disabled={!clientId.trim() || !secret.trim() || Boolean(busy)} onClick={() => void act('connect', async () => (await window.stm.mail.connect('gmail', clientId, secret), setSecret(''), setSt(await window.stm.mail.status())))}>
                        {busy === 'connect' ? <span className="spinner" /> : 'Sign in with Google'}
                      </button>
                    ),
                  },
                ]}
                footer={<span>Tokens stay encrypted in this Mac’s keychain. The window and Claude never see them.</span>}
              />
            </div>
            )}
          </div>
          </div>
        )}

        {st && on && (
          <div className="mail-body">
            <nav className="mail-folders">
              <AccountNav st={st} acct={acct} counts={counts} pick={(a) => (setAcct(a), setFolder('inbox'), setSearch(''), setQ(''))} />
              <div className="mail-sep" />
              {st.folders.map((f) => (
                <button key={f.id} className={folder === f.id && !search ? 'on' : ''} onClick={() => (setSearch(''), setQ(''), setFolder(f.id))}>
                  <span>{f.name}</span>
                  {f.id === 'inbox' && (counts[acct] ?? 0) > 0 && <span className="mail-count">{counts[acct]}</span>}
                </button>
              ))}
              <span className="spacer-flex" />
              <button className="mail-disconnect" onClick={() => void act('out', async () => (await window.stm.mail.disconnect(acct), setSt(await window.stm.mail.status())))}>Disconnect {acct === 'gmail' ? 'Gmail' : 'Outlook'}</button>
            </nav>

            <div className="mail-list" ref={listRef}>
              {search && <div className="mail-list-head">Results for “{search}”</div>}
              {items.map((it) => (
                <button key={it.id} className={`mail-item ${sel === it.id ? 'on' : ''} ${it.read ? '' : 'unread'}`} onClick={() => void open(it)}>
                  <span className="mail-av" style={{ background: hue(it.from?.address ?? '?') }} aria-hidden="true">{initials(it.from?.name ?? '?')}</span>
                  <span className="mail-from">{it.from?.name ?? 'Unknown'}</span>
                  <span className="mail-when">{when(it.at)}</span>
                  <span className="mail-subj">
                    {it.flagged && <span className="mail-flag" aria-label="Flagged" />}
                    {it.subject}
                  </span>
                  <span className="mail-prev">{it.preview}</span>
                  {it.attachments && (
                    <svg className="mail-clip" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-label="Attachment"><path d="M11 5 6 10a1.5 1.5 0 0 0 2 2l5.5-5.5a3 3 0 0 0-4-4L4 8a4.5 4.5 0 0 0 6 6l4-4" /></svg>
                  )}
                </button>
              ))}
              {busy === 'list' && !items.length && <div className="mail-empty"><span className="spinner" /></div>}
              {busy !== 'list' && !items.length && <div className="mail-empty faint">{search ? 'Nothing found.' : 'Nothing here.'}</div>}
              {next && (
                <button className="ghost small mail-more" disabled={Boolean(busy)} onClick={() => void act('more', () => load(true))}>
                  {busy === 'more' ? <span className="spinner" /> : 'Load more'}
                </button>
              )}
            </div>

            <section className="mail-read">
              {compose ? (
                <div className="mail-compose">
                  <div className="mail-compose-title">New message</div>
                  <input placeholder="To" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} autoFocus />
                  <input placeholder="Cc" value={compose.cc} onChange={(e) => setCompose({ ...compose, cc: e.target.value })} />
                  <input placeholder="Subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
                  <textarea placeholder="Write your message" value={compose.text} onChange={(e) => setCompose({ ...compose, text: e.target.value })} />
                  <div className="mail-actions end">
                    <button className="ghost small" onClick={() => setCompose(null)}>Discard</button>
                    <button className="primary small" disabled={!compose.to.trim() || Boolean(busy)} onClick={() => void act('send', async () => (await window.stm.mail.send(acct, compose), setCompose(null)))}>
                      {busy === 'send' ? <span className="spinner" /> : 'Send'}
                    </button>
                  </div>
                </div>
              ) : msg && doc ? (
                <>
                  <div className="mail-read-head">
                    <h2 className="mail-read-subj">{msg.subject}</h2>
                    <div className="mail-read-meta">
                      <span className="mail-av big" style={{ background: hue(msg.from?.address ?? '?') }} aria-hidden="true">{initials(msg.from?.name ?? '?')}</span>
                      <div className="mail-read-who">
                        <div><b>{msg.from?.name}</b> <span className="faint">{msg.from?.address}</span></div>
                        <div className="faint">To {msg.to.map((p) => p.name).join(', ') || 'you'}{msg.cc.length ? ` · Cc ${msg.cc.map((p) => p.name).join(', ')}` : ''}</div>
                      </div>
                      <span className="faint mail-read-when">{new Date(msg.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    </div>
                    <div className="mail-actions">
                      <button className="ghost small" onClick={() => setReply({ all: false, text: '' })}>Reply</button>
                      <button className="ghost small" onClick={() => setReply({ all: true, text: '' })}>Reply all</button>
                      <button className="ghost small" disabled={Boolean(busy)} onClick={() => void moveTo('archive')}>Archive</button>
                      <button className="ghost small" disabled={Boolean(busy)} onClick={() => void moveTo('deleteditems')}>Delete</button>
                      <button className="ghost small" onClick={() => void act('unread', async () => (await window.stm.mail.markRead(acct, msg.id, false), setItems((l) => l.map((x) => (x.id === msg.id ? { ...x, read: false } : x)))))}>Mark unread</button>
                      <span className="spacer-flex" />
                      {msg.webLink && <button className="ghost small" onClick={() => void window.stm.openUrl(msg.webLink!)}>Open in {acct === 'gmail' ? 'Gmail' : 'Outlook'}</button>}
                    </div>
                  </div>
                  {doc.remoteImages > 0 && !images && (
                    <div className="mail-images">
                      <span>Remote images are off, so the sender cannot tell you opened this.</span>
                      <button className="ghost small" onClick={() => setImages(true)}>Show images</button>
                    </div>
                  )}
                  <iframe className="mail-frame" title="Message" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={doc.html} />
                  {reply && (
                    <div className="mail-reply">
                      <textarea autoFocus placeholder={reply.all ? 'Reply to everyone' : `Reply to ${msg.from?.name ?? ''}`} value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} />
                      <div className="mail-actions end">
                        <button className="ghost small" onClick={() => setReply(null)}>Discard</button>
                        <button className="primary small" disabled={!reply.text.trim() || Boolean(busy)} onClick={() => void act('reply', async () => (await window.stm.mail.reply(acct, msg.id, reply.text, reply.all), setReply(null)))}>
                          {busy === 'reply' ? <span className="spinner" /> : 'Send'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="mail-empty faint">{busy === 'open' ? <span className="spinner" /> : 'Pick a message.'}</div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

/** The mail accounts, connected or not, at the top of the folder column. */
function AccountNav(props: { st: Status; acct: Account; counts: Partial<Record<Account, number>>; pick: (a: Account) => void }) {
  return (
    <div className="mail-accounts">
      {(['outlook', 'gmail'] as Account[]).map((a) => {
        const s = props.st.accounts[a]
        return (
          <button key={a} className={`mail-acct ${props.acct === a ? 'on' : ''}`} onClick={() => props.pick(a)}>
            <IntegrationMark id={a} name={a === 'gmail' ? 'Gmail' : 'Outlook'} size={26} />
            <span className="mail-acct-text">
              <span>{a === 'gmail' ? 'Gmail' : 'Outlook'}</span>
              <span className="faint">{s.connected ? s.account?.address : 'Connect'}</span>
            </span>
            {(props.counts[a] ?? 0) > 0 && <span className="mail-count">{props.counts[a]}</span>}
          </button>
        )
      })}
    </div>
  )
}
