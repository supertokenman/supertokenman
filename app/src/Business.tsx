import { Steps } from './Steps'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconClose } from './icons'
import type { Comment, NetworkId, Post, Profile } from '../electron/social/core'
import type { FeedItem } from '../electron/social/open'
import { problem, stateOf, type Item } from '../electron/social/queue'
import type { SocialStatus } from './bridge'
import { clean } from './errors'
import { IntegrationMark } from './IntegrationMark'
import { Content } from './Content'
import type { Piece } from '../electron/content/pieces'
import type { StorageConfig } from '../electron/content/storage'
import { Checkbox, DateTimeField, Select } from './ui'

type Tab = 'content' | 'feed' | 'overview' | 'comments' | 'queue' | 'accounts'
const n0 = (v?: number) => (v == null ? '–' : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : v.toLocaleString(undefined))
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const LIMIT: Partial<Record<NetworkId, number>> = { x: 280, threads: 500, instagram: 2200, linkedin: 3000, facebook: 63206, tiktok: 2200 }

/** Business: your social accounts through their official APIs, in the app's own interface. */
export function Business(props: { onClose: () => void; seed?: { title: string; idea: string } | null; project: string; usdToBrl: number; onScript: (piece: Piece, prompt: string) => void }) {
  const [tab, setTab] = useState<Tab>('content')
  const [project, setProject] = useState(props.project)
  const [nets, setNets] = useState<SocialStatus[]>([])
  const [err, setErr] = useState('')
  const load = useCallback(() => void window.stm.social.status().then(setNets), [])
  useEffect(() => {
    load()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props, load])
  const live = nets.filter((x) => x.connected)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet business" role="dialog" aria-label="Business">
        <header className="sheet-head">
          <div className="sheet-title">Business</div>
          <div className="segmented">
            {(['content', 'feed', 'overview', 'comments', 'queue', 'accounts'] as Tab[]).map((t) => (
              <button key={t} aria-selected={tab === t} onClick={() => setTab(t)}>
                {t === 'content' ? 'Content' : t === 'feed' ? 'Feed' : t === 'overview' ? 'Overview' : t === 'comments' ? 'Comments' : t === 'queue' ? 'Queue' : `Accounts${live.length ? ` · ${live.length}` : ''}`}
              </button>
            ))}
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body biz-body">
          {err && <div className="notice error">{err}</div>}
          {tab === 'accounts' && <Accounts nets={nets} onChange={load} onErr={setErr} />}
          {tab === 'content' && <Content seed={props.seed} project={project} onProject={setProject} nets={nets} onScript={props.onScript} onErr={setErr} usdToBrl={props.usdToBrl} />}
          {tab !== 'accounts' && tab !== 'content' && !live.length && (
            <div className="sheet-empty">
              <div className="se-title">No account connected yet</div>
              <div className="se-text">Connect Instagram, Facebook, Threads, YouTube, LinkedIn, X or TikTok. Tokens stay encrypted in this Mac’s keychain; the window never sees them.</div>
              <button className="primary small" onClick={() => setTab('accounts')}>Connect an account</button>
            </div>
          )}
          {tab === 'feed' && <Feed nets={live.filter((x) => x.id === 'bluesky' || x.id === 'mastodon')} onAccounts={() => setTab('accounts')} onErr={setErr} />}
          {tab === 'overview' && live.length > 0 && <Overview nets={live} onErr={setErr} />}
          {tab === 'comments' && live.length > 0 && <Comments nets={live.filter((x) => x.can.comments)} onErr={setErr} />}
          {tab === 'queue' && live.length > 0 && <Queue nets={nets} onErr={setErr} />}
        </div>
      </div>
    </div>
  )
}

function NetPicker(props: { nets: SocialStatus[]; value: NetworkId | null; onPick: (n: NetworkId) => void }) {
  return (
    <div className="biz-nets">
      {props.nets.map((x) => (
        <button key={x.id} className={`biz-net ${props.value === x.id ? 'on' : ''}`} onClick={() => props.onPick(x.id)}>
          <IntegrationMark id={x.id} name={x.name} size={18} />
          {x.name}
        </button>
      ))}
    </div>
  )
}

function Overview(props: { nets: SocialStatus[]; onErr: (e: string) => void }) {
  const [net, setNet] = useState<NetworkId>(props.nets[0]!.id)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[] | null>(null)
  useEffect(() => {
    setProfile(null)
    setPosts(null)
    props.onErr('')
    window.stm.social.profile(net).then(setProfile, (e) => props.onErr(clean(e)))
    window.stm.social.posts(net).then(setPosts, (e) => (setPosts([]), props.onErr(clean(e))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net])
  const totals = useMemo(() => (posts ?? []).reduce((a, p) => ({ likes: a.likes + (p.likes ?? 0), comments: a.comments + (p.comments ?? 0), views: a.views + (p.views ?? 0) }), { likes: 0, comments: 0, views: 0 }), [posts])
  const max = Math.max(1, ...(posts ?? []).map((p) => (p.likes ?? 0) + (p.comments ?? 0) * 2))
  return (
    <>
      <NetPicker nets={props.nets} value={net} onPick={setNet} />
      <div className="biz-head">
        {profile?.avatar ? <img className="biz-avatar" src={profile.avatar} alt="" /> : <IntegrationMark id={net} size={44} />}
        <div className="biz-who">
          <div className="biz-name">{profile?.name ?? '...'}</div>
          <div className="faint">{profile?.handle}</div>
        </div>
        <div className="biz-stats">
          <div><strong>{n0(profile?.followers)}</strong><span>followers</span></div>
          <div><strong>{n0(profile?.posts)}</strong><span>posts</span></div>
          <div><strong>{n0(totals.likes)}</strong><span>likes, last {posts?.length ?? 0}</span></div>
          <div><strong>{n0(totals.comments)}</strong><span>comments</span></div>
          {totals.views > 0 && <div><strong>{n0(totals.views)}</strong><span>views</span></div>}
        </div>
        {profile?.url && <button className="ghost small" onClick={() => void window.stm.setupOpen(profile.url!)}>Open profile</button>}
      </div>
      {posts === null ? (
        <div className="faint pad">Reading posts...</div>
      ) : posts.length === 0 ? (
        <div className="faint pad">{props.nets.find((x) => x.id === net)?.can.read ? 'No posts yet.' : props.nets.find((x) => x.id === net)?.can.note}</div>
      ) : (
        <div className="biz-posts">
          {posts.map((p) => (
            <button key={p.id} className="biz-post" onClick={() => p.url && void window.stm.setupOpen(p.url)}>
              {p.media ? <img src={p.media} alt="" loading="lazy" /> : <span className="biz-post-text">{p.text || 'Untitled'}</span>}
              <span className="biz-post-meta">
                <span className="biz-bar"><span style={{ width: `${(((p.likes ?? 0) + (p.comments ?? 0) * 2) / max) * 100}%` }} /></span>
                <span>{n0(p.likes)} likes · {n0(p.comments)} comments{p.views != null ? ` · ${n0(p.views)} views` : ''}</span>
                <span className="faint">{when(p.at)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function Comments(props: { nets: SocialStatus[]; onErr: (e: string) => void }) {
  const [net, setNet] = useState<NetworkId | null>(props.nets[0]?.id ?? null)
  const [posts, setPosts] = useState<Post[]>([])
  const [post, setPost] = useState<Post | null>(null)
  const [list, setList] = useState<Comment[] | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  useEffect(() => {
    if (!net) return
    setPost(null)
    setList(null)
    window.stm.social.posts(net).then((ps) => (setPosts(ps), setPost(ps.find((p) => (p.comments ?? 1) > 0) ?? ps[0] ?? null)), (e) => props.onErr(clean(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net])
  useEffect(() => {
    if (!net || !post) return
    setList(null)
    window.stm.social.comments(net, post.id).then(setList, (e) => (setList([]), props.onErr(clean(e))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post])
  if (!props.nets.length) return <div className="faint pad">None of the connected accounts lets the app read comments through its API.</div>
  return (
    <>
      <NetPicker nets={props.nets} value={net} onPick={setNet} />
      <div className="biz-comments">
        <div className="biz-plist">
          {posts.map((p) => (
            <button key={p.id} className={`biz-prow ${post?.id === p.id ? 'on' : ''}`} onClick={() => setPost(p)}>
              {p.media && <img src={p.media} alt="" />}
              <span className="biz-prow-text">{p.text || 'Untitled'}</span>
              <span className="pill">{p.comments ?? '–'}</span>
            </button>
          ))}
        </div>
        <div className="biz-clist">
          {list === null ? (
            <div className="faint pad">Reading comments...</div>
          ) : list.length === 0 ? (
            <div className="faint pad">No comments on this post.</div>
          ) : (
            list.map((c) => (
              <div key={c.id} className="biz-c">
                <div className="biz-c-top"><strong>{c.author}</strong><span className="faint">{when(c.at)}</span></div>
                <div className="biz-c-text">{c.text}</div>
                <div className="biz-c-reply">
                  <input placeholder="Reply..." value={draft[c.id] ?? ''} onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })} />
                  <button className="ghost small" disabled={busy === c.id} onClick={async () => { setBusy(c.id); try { setDraft({ ...draft, [c.id]: await window.stm.social.suggest(c.text, post?.text ?? '') }) } catch (e) { props.onErr(clean(e)) } setBusy('') }} data-tip="One short call to the smallest model; you edit before sending">Suggest</button>
                  <button
                    className="primary small"
                    disabled={!draft[c.id]?.trim() || busy === c.id}
                    onClick={async () => {
                      if (!confirm(`Reply publicly as your account?\n\n${draft[c.id]}`)) return
                      setBusy(c.id)
                      try {
                        await window.stm.social.reply(net!, c.id, draft[c.id]!, post?.id)
                        setDraft({ ...draft, [c.id]: '' })
                        setList(await window.stm.social.comments(net!, post!.id))
                      } catch (e) {
                        props.onErr(clean(e))
                      }
                      setBusy('')
                    }}
                  >
                    Reply
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

const STATE_LABEL = { draft: 'Draft', scheduled: 'Scheduled', publishing: 'Going out', done: 'Posted', partly: 'Partly posted', failed: 'Failed' }

function Queue(props: { nets: SocialStatus[]; onErr: (e: string) => void }) {
  const [q, setQ] = useState<Item[]>([])
  const blank = { text: '', networks: props.nets.filter((x) => x.connected && x.can.publish).map((x) => x.id), when: null } as Partial<Item>
  const [d, setD] = useState<Partial<Item>>(blank)
  useEffect(() => {
    void window.stm.social.queue().then(setQ)
    const t = setInterval(() => void window.stm.social.queue().then(setQ), 15_000)
    return () => clearInterval(t)
  }, [])
  const run = async (fn: () => Promise<Item[]>) => {
    props.onErr('')
    try {
      setQ(await fn())
    } catch (e) {
      props.onErr(clean(e))
    }
  }
  const pub = props.nets.filter((x) => x.can.publish)
  const draftItem = { text: d.text ?? '', networks: d.networks ?? [], mediaUrl: d.mediaUrl, mediaKind: d.mediaKind, link: d.link } as Item
  const local = (ms: number | null | undefined) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
  return (
    <div className="biz-queue">
      <div className="biz-compose">
        <textarea placeholder="Write the post" value={d.text ?? ''} onChange={(e) => setD({ ...d, text: e.target.value })} />
        <div className="biz-row">
          <input placeholder="Photo or video: public https link (optional)" value={d.mediaUrl ?? ''} onChange={(e) => setD({ ...d, mediaUrl: e.target.value || undefined })} />
          <div className="segmented">
            <button aria-selected={d.mediaKind !== 'video'} onClick={() => setD({ ...d, mediaKind: 'image' })}>Photo</button>
            <button aria-selected={d.mediaKind === 'video'} onClick={() => setD({ ...d, mediaKind: 'video' })}>Video</button>
          </div>
          <input placeholder="Link (optional)" value={d.link ?? ''} onChange={(e) => setD({ ...d, link: e.target.value || undefined })} />
        </div>
        <div className="biz-row">
          {pub.map((x) => {
            const on = d.networks?.includes(x.id)
            const p = on && (draftItem.text.trim() || draftItem.mediaUrl) ? problem(draftItem, x.id) : ''
            const lim = LIMIT[x.id]
            return (
              <label key={x.id} className={`pe-int ${on ? 'on' : ''} ${p ? 'warn' : ''}`} data-tip={!x.connected ? 'Not connected' : p || x.can.note}>
                <Checkbox disabled={!x.connected} checked={Boolean(on)} onChange={() => setD({ ...d, networks: on ? d.networks!.filter((y) => y !== x.id) : [...(d.networks ?? []), x.id] })} />
                <IntegrationMark id={x.id} name={x.name} size={16} />
                {x.name}
                {on && lim && <span className={`biz-count ${(d.text ?? '').length > lim ? 'over' : ''}`}>{(d.text ?? '').length}/{lim}</span>}
              </label>
            )
          })}
        </div>
        <div className="biz-row">
          <span className="faint">When</span>
          <DateTimeField className="trig-time" value={local(d.when)} onChange={(e) => setD({ ...d, when: e.target.value ? new Date(e.target.value).getTime() : null })} />
          <span className="faint">{d.when ? '' : 'as soon as you approve it'}</span>
          <span className="spacer-flex" />
          <button className="primary small" disabled={!d.text?.trim() || !d.networks?.length} onClick={() => void run(async () => { const r = await window.stm.social.save(d); setD(blank); return r })}>Add to queue</button>
        </div>
        {(draftItem.text.trim() || draftItem.mediaUrl) && draftItem.networks.map((n) => problem(draftItem, n) && <div key={n} className="biz-warn">{props.nets.find((x) => x.id === n)?.name}: {problem(draftItem, n)}</div>)}
      </div>
      <div className="biz-items">
        {q.map((i) => {
          const st = stateOf(i)
          return (
            <div key={i.id} className={`biz-item ${st}`}>
              <div className="biz-item-top">
                <span className={`biz-state ${st}`}>{STATE_LABEL[st]}</span>
                <span className="faint">{i.when ? new Date(i.when).toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'on approval'}</span>
                <span className="spacer-flex" />
                {st === 'draft' && <button className="primary small" onClick={() => void run(() => window.stm.social.approve(i.id, true))}>Approve</button>}
                {st === 'scheduled' && <button className="ghost small" onClick={() => void run(() => window.stm.social.approve(i.id, false))}>Unapprove</button>}
                {(st === 'failed' || st === 'partly') && <button className="ghost small" onClick={() => void run(() => window.stm.social.retry(i.id))}>Retry failed</button>}
                <button className="ghost small pcard-del" onClick={() => void run(() => window.stm.social.remove(i.id))}>Delete</button>
              </div>
              <div className="biz-item-text">{i.text}</div>
              <div className="biz-item-nets">
                {i.networks.map((n) => {
                  const r = i.results[n]
                  return (
                    <span key={n} className={`biz-res ${r ? (r.ok ? 'ok' : 'bad') : ''}`} data-tip={r?.error ?? r?.url ?? ''}>
                      <IntegrationMark id={n} size={14} />
                      {r ? (r.ok ? 'posted' : 'failed') : 'waiting'}
                      {r?.url && <button className="ghost small" onClick={() => void window.stm.setupOpen(r.url!)}>Open</button>}
                    </span>
                  )
                })}
              </div>
              {Object.values(i.results).filter((r) => r && !r.ok).map((r, k) => <div key={k} className="biz-warn">{r!.error}</div>)}
            </div>
          )
        })}
        {!q.length && <div className="faint pad">Nothing queued. Every post waits for your Approve before it goes out.</div>}
      </div>
    </div>
  )
}

function Accounts(props: { nets: SocialStatus[]; onChange: () => void; onErr: (e: string) => void }) {
  const [open, setOpen] = useState<NetworkId | null>(null)
  const [form, setForm] = useState({ token: '', id: '', secret: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const connect = async (x: SocialStatus, how: 'token' | 'oauth') => {
    props.onErr('')
    setBusy(true)
    try {
      // Bluesky and Mastodon take two things: who (handle or server) and the app password or token
      const token = x.id === 'bluesky' || x.id === 'mastodon' ? `${form.id.trim()} ${form.token.trim()}` : form.token
      const p = how === 'token' ? await window.stm.social.connectToken(x.id, token) : await window.stm.social.connectOAuth(x.id, form.id, form.secret)
      setDone(`${x.name}: connected as ${p.handle ?? p.name}.`)
      setForm({ token: '', id: '', secret: '' })
      setOpen(null)
      props.onChange()
    } catch (e) {
      props.onErr(clean(e))
    }
    setBusy(false)
  }
  return (
    <div className="biz-accounts">
      {done && <div className="notice">{done}</div>}
      <StorageCard onErr={props.onErr} />
      <VoiceCard onErr={props.onErr} />
      {props.nets.map((x) => (
        <div key={x.id} className={`biz-acc ${x.connected ? 'on' : ''}`}>
          <div className="biz-acc-top">
            <IntegrationMark id={x.id} name={x.name} size={28} />
            <div className="biz-acc-name">{x.name}</div>
            <span className="biz-caps">
              {(['read', 'comments', 'reply', 'publish'] as const).map((k) => (
                <span key={k} className={x.can[k] ? 'yes' : 'no'}>{k}</span>
              ))}
            </span>
            <span className="spacer-flex" />
            {x.connected ? (
              <button className="ghost small pcard-del" onClick={async () => { if (confirm(`Disconnect ${x.name}? Its token is deleted from this Mac.`)) { try { await window.stm.social.disconnect(x.id); props.onChange() } catch (e) { props.onErr(clean(e)) } } }}>Disconnect</button>
            ) : (
              <button className={open === x.id ? 'ghost small' : 'primary small'} onClick={() => setOpen(open === x.id ? null : x.id)}>{open === x.id ? 'Cancel' : 'Connect'}</button>
            )}
          </div>
          {x.can.note && <div className="biz-note">{x.can.note}</div>}
          {open === x.id && (
            <div className="biz-setup">
              <Steps
                steps={[
                  ...x.steps.map((s, i) => ({ id: `s${i}`, text: s.label, open: { url: s.url } })),
                  ...(x.oauth
                    ? [
                        { id: 'redirect', text: 'Redirect URL for the app entry:', copy: x.redirect ?? '' },
                        { id: 'keys', text: 'Paste its keys, then sign in.', fields: [{ value: form.id, set: (v: string) => setForm({ ...form, id: v }), placeholder: x.id === 'tiktok' ? 'Client key' : 'Client ID' }, { value: form.secret, set: (v: string) => setForm({ ...form, secret: v }), placeholder: 'Client secret', secret: true }] },
                        { id: 'sign', text: <>Sign in with {x.name}.</>, done: false, action: <button className="primary small" disabled={!form.id || busy} onClick={() => void connect(x, 'oauth')}>{busy ? <span className="spinner" /> : 'Sign in'}</button> },
                      ]
                    : [
                        {
                          id: 'token',
                          text: x.id === 'bluesky' ? 'Paste your handle and an app password.' : x.id === 'mastodon' ? 'Paste your server and an access token.' : 'Paste the access token.',
                          done: false,
                          fields: [
                            ...(x.id === 'bluesky' || x.id === 'mastodon' ? [{ value: form.id, set: (v: string) => setForm({ ...form, id: v }), placeholder: x.id === 'bluesky' ? 'Handle, like you.bsky.social' : 'Server, like mastodon.social' }] : []),
                            { value: form.token, set: (v: string) => setForm({ ...form, token: v }), placeholder: x.id === 'bluesky' ? 'App password (xxxx-xxxx-xxxx-xxxx)' : 'Access token', secret: true },
                          ],
                          action: <button className="primary small" disabled={!form.token || ((x.id === 'bluesky' || x.id === 'mastodon') && !form.id) || busy} onClick={() => void connect(x, 'token')}>{busy ? <span className="spinner" /> : 'Save token'}</button>,
                        },
                      ]),
                ]}
              />
              {x.oauth && <div className="faint biz-or">or paste an access token</div>}
              {x.oauth && <div className="biz-row">
                {(x.id === 'bluesky' || x.id === 'mastodon') && <input placeholder={x.id === 'bluesky' ? 'Handle, like you.bsky.social' : 'Server, like mastodon.social'} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} spellCheck={false} />}
                <input placeholder={x.id === 'bluesky' ? 'App password (xxxx-xxxx-xxxx-xxxx)' : 'Access token'} type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
                <button className={x.oauth ? 'ghost small' : 'primary small'} disabled={!form.token || ((x.id === 'bluesky' || x.id === 'mastodon') && !form.id) || busy} onClick={() => void connect(x, 'token')}>{busy ? <span className="spinner" /> : 'Save token'}</button>
              </div>}
              <div className="faint biz-note">Saved encrypted in this Mac’s keychain. Only the app’s main process uses it; the window and Claude never see it.</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** ElevenLabs, optional and paid: its voices join the Content voice picker. The free local voice stays the default. */
function VoiceCard(props: { onErr: (e: string) => void }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.voice.get>> | null>(null)
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => void window.stm.voice.get().then(setSt)
  useEffect(load, [])
  if (!st) return null
  const u = st.usage
  return (
    <div className={`biz-acc ${st.connected && !st.error ? 'on' : ''}`}>
      <div className="biz-acc-top">
        <span className="biz-store-ico" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 28 28"><path d="M0 0H28V20.7L20.7 28H0Z" fill="var(--accent)" /><g fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="square"><path d="M6 12v4M10 9v10M14 6v16M18 10v8M22 12v4" /></g></svg>
        </span>
        <div className="biz-acc-name">ElevenLabs voice</div>
        <span className="faint">
          {st.error ?? (u ? `${u.tier || 'connected'} · ${u.used.toLocaleString()} of ${u.limit.toLocaleString()} characters · ${st.voices?.length ?? 0} voices` : 'Optional and paid. Without it, videos use the free local voice')}
        </span>
        <span className="spacer-flex" />
        {st.connected ? (
          <button className="ghost small pcard-del" onClick={async () => { if (confirm('Disconnect ElevenLabs? Its key is deleted from this Mac.')) { try { await window.stm.voice.disconnect(); load() } catch (e) { props.onErr(clean(e)) } } }}>Disconnect</button>
        ) : (
          <button className={open ? 'ghost small' : 'primary small'} onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Connect'}</button>
        )}
      </div>
      {open && !st.connected && (
        <div className="biz-setup">
          <div className="biz-row">
            <input placeholder="ElevenLabs API key" type="password" value={key} onChange={(e) => setKey(e.target.value)} />
            <button className="ghost small" onClick={() => void window.stm.setupOpen('https://elevenlabs.io/app/settings/api-keys')}>Create key</button>
            <button
              className="primary small"
              disabled={!key || busy}
              onClick={async () => {
                props.onErr('')
                setBusy(true)
                try {
                  await window.stm.voice.connect(key)
                  setKey('')
                  setOpen(false)
                  load()
                } catch (e) {
                  props.onErr(clean(e))
                }
                setBusy(false)
              }}
            >
              {busy ? <span className="spinner" /> : 'Save key'}
            </button>
          </div>
          <div className="faint biz-note">The key is checked, then saved encrypted in this Mac’s keychain. Only the render uses it; the window and Claude never see it. Free ElevenLabs plans do not allow commercial use: check your plan before posting.</div>
        </div>
      )}
    </div>
  )
}

/** Where finished media goes so networks can fetch it: any S3-compatible bucket. */
function StorageCard(props: { onErr: (e: string) => void }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.storage.get>> | null>(null)
  const [open, setOpen] = useState(false)
  const [c, setC] = useState<Partial<StorageConfig>>({ provider: 'r2', prefix: 'content' })
  const [keys, setKeys] = useState({ accessKeyId: '', secretAccessKey: '' })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.stm.storage.get().then((s) => {
      setSt(s)
      if (s.config) setC(s.config)
    })
  }, [])
  if (!st) return null
  const prov = st.providers[c.provider ?? 'r2']!
  const ready = Boolean(st.config?.bucket && st.config.publicBase && st.hasKeys)
  return (
    <div className={`biz-acc ${ready ? 'on' : ''}`}>
      <div className="biz-acc-top">
        <span className="biz-store-ico" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 28 28"><path d="M0 0H28V20.7L20.7 28H0Z" fill="var(--accent)" /><g fill="none" stroke="var(--on-accent)" strokeWidth="2"><path d="M7 9h14v4H7zM7 15h14v4H7z" /><path d="M14 4v3M12 5.5l2-2 2 2" /></g></svg>
        </span>
        <div className="biz-acc-name">Media storage</div>
        <span className="faint">{ready ? `${st.providers[st.config!.provider]!.name} · ${st.config!.bucket}` : 'Where videos go so networks can fetch them'}</span>
        <span className="spacer-flex" />
        <button className={open ? 'ghost small' : ready ? 'ghost small' : 'primary small'} onClick={() => setOpen(!open)}>{open ? 'Close' : ready ? 'Edit' : 'Set up'}</button>
      </div>
      {open && (
        <div className="biz-setup">
          <div className="biz-row">
            <Select value={c.provider} onChange={(e) => setC({ ...c, provider: e.target.value as StorageConfig['provider'] })}>
              {Object.entries(st.providers).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
            </Select>
            <input placeholder="Bucket" value={c.bucket ?? ''} onChange={(e) => setC({ ...c, bucket: e.target.value })} />
            {prov.needs.includes('accountId') && <input placeholder="Account ID" value={c.accountId ?? ''} onChange={(e) => setC({ ...c, accountId: e.target.value })} />}
            {prov.needs.includes('region') && <input placeholder="Region" value={c.region ?? ''} onChange={(e) => setC({ ...c, region: e.target.value })} />}
            {prov.needs.includes('endpoint') && <input placeholder="Endpoint https://..." value={c.endpoint ?? ''} onChange={(e) => setC({ ...c, endpoint: e.target.value })} />}
          </div>
          <div className="biz-row">
            <input placeholder="Public link base, https://media.yourdomain.com" value={c.publicBase ?? ''} onChange={(e) => setC({ ...c, publicBase: e.target.value })} />
            <input placeholder="Folder in the bucket" value={c.prefix ?? ''} onChange={(e) => setC({ ...c, prefix: e.target.value })} style={{ maxWidth: 180 }} />
          </div>
          <div className="faint biz-note">{prov.hint}</div>
          <div className="biz-row">
            <input placeholder={st.hasKeys ? 'Access key ID (saved; type to replace)' : 'Access key ID'} type="password" value={keys.accessKeyId} onChange={(e) => setKeys({ ...keys, accessKeyId: e.target.value })} />
            <input placeholder="Secret access key" type="password" value={keys.secretAccessKey} onChange={(e) => setKeys({ ...keys, secretAccessKey: e.target.value })} />
            <button className="ghost small" onClick={() => void window.stm.setupOpen(prov.keysAt)}>Create keys</button>
          </div>
          <div className="biz-row">
            <span className="faint">Keys go to the keychain-encrypted vault. Give them write access to this bucket only.</span>
            <span className="spacer-flex" />
            <button
              className="ghost small"
              disabled={!ready || busy}
              onClick={async () => {
                setBusy(true)
                setNote('')
                try {
                  const r = await window.stm.storage.test()
                  setNote(r.publicOk ? `Works: uploaded and opened ${r.url}` : `Uploaded, but ${r.url} does not open publicly yet: make the bucket or its domain public.`)
                } catch (e) {
                  props.onErr(clean(e))
                }
                setBusy(false)
              }}
            >
              {busy ? <span className="spinner" /> : 'Test'}
            </button>
            <button
              className="primary small"
              onClick={async () => {
                props.onErr('')
                try {
                  const r = await window.stm.storage.set(c, keys.accessKeyId && keys.secretAccessKey ? keys : undefined)
                  setSt({ ...st, config: r.config, hasKeys: r.hasKeys })
                  setKeys({ accessKeyId: '', secretAccessKey: '' })
                  setNote('Saved.')
                } catch (e) {
                  props.onErr(clean(e))
                }
              }}
            >
              Save
            </button>
          </div>
          {note && <div className="biz-note">{note}</div>}
        </div>
      )}
    </div>
  )
}

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
/** Text with its links as buttons that open in the browser; everything else stays plain text. */
function Linked(props: { text: string }) {
  const parts = props.text.split(/(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g)
  return <>{parts.map((p, i) => (i % 2 ? <button key={i} className="feed-link" onClick={() => void window.stm.openUrl(p)}>{p.replace(/^https?:\/\//, '').slice(0, 48)}{p.length > 56 ? '…' : ''}</button> : <span key={i}>{p}</span>))}</>
}

/** The home timeline of Bluesky or Mastodon, drawn in the app's design: read, like, repost, reply. */
function Feed(props: { nets: SocialStatus[]; onAccounts: () => void; onErr: (e: string) => void }) {
  const [net, setNet] = useState<NetworkId | null>(props.nets[0]?.id ?? null)
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [replying, setReplying] = useState<{ id: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    if (!net) return
    setItems(null)
    window.stm.social.timeline(net).then(setItems, (e) => (setItems([]), props.onErr(clean(e))))
  }, [net, props])
  useEffect(load, [load])
  if (!props.nets.length)
    return (
      <div className="sheet-empty">
        <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><rect x="10" y="12" width="36" height="10" rx="3" className="se-b" /><rect x="10" y="26" width="36" height="10" rx="3" className="se-b" /><path d="M14 44h28" className="se-line" /></svg>
        <div className="se-title">Your timeline, in this app</div>
        <div className="se-text">Bluesky and Mastodon let any account read its home timeline. Connect one and it shows here, in the app’s own design, with like, repost and reply.</div>
        <button className="primary small" onClick={props.onAccounts}>Connect Bluesky or Mastodon</button>
      </div>
    )
  const patch = (id: string, fn: (i: FeedItem) => FeedItem) => setItems((l) => l?.map((x) => (x.id === id ? fn(x) : x)) ?? l)
  return (
    <div className="feed">
      <div className="feed-bar">
        <div className="segmented">
          {props.nets.map((n) => (
            <button key={n.id} aria-selected={net === n.id} onClick={() => setNet(n.id)}>
              <IntegrationMark id={n.id} name={n.name} size={16} /> {n.name}
            </button>
          ))}
        </div>
        <span className="spacer-flex" />
        <button className="ghost small" onClick={load}>Refresh</button>
      </div>
      {items === null && <div className="faint pad">Reading the timeline...</div>}
      <ol className="feed-list">
        {items?.map((it) => (
          <li key={it.id} className="feed-item">
            {it.author.avatar ? <img className="feed-av" src={it.author.avatar} alt="" /> : <span className="feed-av initials" aria-hidden="true">{it.author.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}</span>}
            <div className="feed-main">
              {it.repostedBy && <div className="feed-rt faint">Reposted by {it.repostedBy}</div>}
              <div className="feed-who">
                <b>{it.author.name}</b> <span className="faint">{it.author.handle}</span> <span className="faint">· {ago(it.at)}</span>
              </div>
              <div className="feed-text"><Linked text={it.text} /></div>
              {it.media && <img className="feed-media" src={it.media} alt="" loading="lazy" />}
              <div className="feed-actions">
                <button onClick={() => setReplying(replying?.id === it.id ? null : { id: it.id, text: '' })}>Reply {it.replies ? it.replies : ''}</button>
                <button className={it.reposted ? 'on' : ''} disabled={it.reposted} onClick={() => net && (patch(it.id, (x) => ({ ...x, reposted: true, reposts: x.reposts + 1 })), window.stm.social.repost(net, it.id).catch((e) => (patch(it.id, (x) => ({ ...x, reposted: false, reposts: x.reposts - 1 })), props.onErr(clean(e)))))}>Repost {it.reposts || ''}</button>
                <button className={it.liked ? 'on' : ''} disabled={it.liked} onClick={() => net && (patch(it.id, (x) => ({ ...x, liked: true, likes: x.likes + 1 })), window.stm.social.like(net, it.id).catch((e) => (patch(it.id, (x) => ({ ...x, liked: false, likes: x.likes - 1 })), props.onErr(clean(e)))))}>Like {it.likes || ''}</button>
                <span className="spacer-flex" />
                {it.url && <button onClick={() => void window.stm.openUrl(it.url!)}>Open</button>}
              </div>
              {replying?.id === it.id && (
                <div className="feed-reply">
                  <textarea autoFocus placeholder={`Reply to ${it.author.handle}`} value={replying.text} onChange={(e) => setReplying({ ...replying, text: e.target.value })} />
                  <button
                    className="primary small"
                    disabled={!replying.text.trim() || busy}
                    onClick={async () => {
                      if (!net) return
                      setBusy(true)
                      try {
                        await window.stm.social.reply(net, it.id, replying.text)
                        patch(it.id, (x) => ({ ...x, replies: x.replies + 1 }))
                        setReplying(null)
                      } catch (e) {
                        props.onErr(clean(e))
                      }
                      setBusy(false)
                    }}
                  >
                    {busy ? <span className="spinner" /> : 'Reply'}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
