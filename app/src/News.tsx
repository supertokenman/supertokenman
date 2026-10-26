import { useCallback, useEffect, useState } from 'react'
import type { Feed } from '../electron/news'
import type { FeedItem as Item } from '../shared/feeds'
import { BriefingView, SetupView } from './FeedsSetup'
import { IconCheckAll, IconRefresh, IconClose } from './icons'

const READ_KEY = 'stm.news.read'
const readSet = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]') as string[])
  } catch {
    return new Set()
  }
}
const ago = (iso: string) => {
  if (!iso) return ''
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 11)

/** The feed lives with the app: fetched every 15 minutes, read marks kept on this machine. */
export function useNews() {
  const [items, setItems] = useState<Item[]>([])
  const [errors, setErrors] = useState<{ feed: string; error: string }[]>([])
  const [read, setRead] = useState(readSet)
  const [loading, setLoading] = useState(false)
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.stm.news.fetch()
      setItems(r.items)
      setErrors(r.errors)
    } catch {
      // offline: keep what we have
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
    const t = setInterval(() => !document.hidden && void refresh(), 15 * 60_000)
    return () => clearInterval(t)
  }, [refresh])
  const mark = (ids: string[]) =>
    setRead((r) => {
      const next = new Set([...r, ...ids])
      try {
        // the newest 3000 marks are enough to cover every feed
        localStorage.setItem(READ_KEY, JSON.stringify([...next].slice(-3000)))
      } catch {
        // storage off: marks last this session
      }
      return next
    })
  return { items, errors, read, mark, refresh, loading, unread: items.filter((i) => !read.has(i.id)).length }
}

/**
 * A cover for an item with no picture: a Constructivist composition (a disc, a bar, a wedge) placed by
 * the title's hash, in the source's hue, so every story gets its own and a source keeps its color.
 */
export function Cover({ item }: { item: Item }) {
  const h = hue(item.source)
  const k = hue(item.title)
  const x = 30 + (k % 140)
  const r = 26 + (k % 30)
  const tilt = (k % 50) - 25
  return (
    <svg className="nw-cover" viewBox="0 0 240 135" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="240" height="135" fill={`hsl(${h} 30% 16%)`} />
      <circle cx={x} cy={60 + (k % 30)} r={r} fill={`hsl(${h} 70% 58%)`} />
      <rect x={-40} y={70 + (k % 25)} width="340" height={10 + (k % 8)} fill={`hsl(${(h + 30) % 360} 15% 88%)`} transform={`rotate(${tilt} 120 67)`} />
      <path d={`M${200 - (k % 60)} 0 L240 0 L240 ${50 + (k % 60)}z`} fill={`hsl(${(h + 180) % 360} 60% 55%)`} />
      <text x="14" y="122" className="nw-cover-src">{item.source.toUpperCase()}</text>
    </svg>
  )
}

/** The item's own picture, or its drawn cover when there is none or it fails to load. */
function Picture({ item, className = 'nw-cover' }: { item: Item; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (!item.image || broken) return <Cover item={item} />
  return <img className={className} src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
}

export function NewsSheet(props: { news: ReturnType<typeof useNews>; onAsk: (text: string) => void; onClose: () => void }) {
  const { news } = props
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [suggested, setSuggested] = useState<Feed[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [open, setOpen] = useState<Item | null>(null)
  const [article, setArticle] = useState<{ title: string; paragraphs: string[]; image?: string } | null>(null)
  const [articleErr, setArticleErr] = useState('')
  const [adding, setAdding] = useState('')
  const [addErr, setAddErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'grid' | 'brief' | 'setup'>('grid')

  useEffect(() => {
    void window.stm.news.feeds().then(setFeeds)
    void window.stm.news.suggested().then(setSuggested)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (open) setOpen(null)
      else props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props, open])

  const openItem = async (i: Item) => {
    news.mark([i.id])
    setOpen(i)
    setArticle(null)
    setArticleErr('')
    // a video is a link only, nothing is fetched or played here; a newsletter is read from the mail
    if (i.video) return setArticle({ title: i.title, paragraphs: [] })
    try {
      setArticle(i.newsletter ? await window.stm.news.newsletter(i.id) : await window.stm.news.read(i.link))
    } catch (e) {
      setArticleErr((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }
  const shown = news.items.filter((i) => (!source || i.source === source) && (!unreadOnly || !news.read.has(i.id)))
  const counts = new Map<string, number>()
  for (const i of news.items) if (!news.read.has(i.id)) counts.set(i.source, (counts.get(i.source) ?? 0) + 1)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet news" role="dialog" aria-label="News">
        <header className="sheet-head">
          <div className="sheet-title">News</div>
          {news.unread > 0 && <span className="badge accent">{news.unread} new</span>}
          <span className="spacer-flex" />
          <div className="segmented">
            <button aria-selected={view === 'grid'} onClick={() => (setView('grid'), setOpen(null))}>Reader</button>
            <button aria-selected={view === 'brief'} onClick={() => (setView('brief'), setOpen(null))}>Briefing</button>
            <button aria-selected={view === 'setup'} onClick={() => (setView('setup'), setOpen(null))}>Rules and more</button>
          </div>
          <div className="segmented">
            <button aria-selected={!unreadOnly} onClick={() => setUnreadOnly(false)}>All</button>
            <button aria-selected={unreadOnly} onClick={() => setUnreadOnly(true)}>Unread</button>
          </div>
          <button className="icon" title="Mark all read" aria-label="Mark all read" onClick={() => news.mark(shown.map((i) => i.id))}><IconCheckAll /></button>
          <button className="icon" title="Refresh" aria-label="Refresh" onClick={() => void news.refresh()}>{news.loading ? <span className="spinner" /> : <IconRefresh />}</button>
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="nw-body">
          <nav className="nw-sources">
            <button className={`nw-src ${!source ? 'on' : ''}`} onClick={() => setSource(null)}><span className="nw-dot all" />All<span className="faint">{news.unread || ''}</span></button>
            {feeds.map((f) => (
              <span key={f.url} className="nw-src-row">
                <button className={`nw-src ${source === f.title ? 'on' : ''}`} onClick={() => setSource(f.title)} title={f.url}>
                  <span className="nw-dot" style={{ background: `hsl(${hue(f.title)} 70% 58%)` }} />
                  {f.title}
                  <span className="faint">{counts.get(f.title) || ''}</span>
                </button>
                <button className="nw-x" title="Remove feed" onClick={() => void window.stm.news.remove(f.url).then((x) => { setFeeds(x); void news.refresh() })}>×</button>
              </span>
            ))}
            <form className="nw-add" onSubmit={(e) => {
              e.preventDefault()
              setBusy(true)
              setAddErr('')
              window.stm.news.add(adding).then((x) => { setFeeds(x); setAdding(''); void news.refresh() }).catch((err: Error) => setAddErr(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))).finally(() => setBusy(false))
            }}>
              <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a site or feed" spellCheck={false} />
              {busy && <span className="spinner" />}
            </form>
            {addErr && <span className="nw-err">{addErr}</span>}
            {suggested.some((s) => !feeds.some((f) => f.url === s.url)) && <span className="faint">Suggested: nothing is read until you add it</span>}
            {suggested.filter((s) => !feeds.some((f) => f.url === s.url)).map((s) => (
              <button key={s.url} className="ghost small" title={s.url} onClick={() => void window.stm.news.add(s.url).then((x) => { setFeeds(x); void news.refresh() })}>
                Add {s.title}
              </button>
            ))}
            {news.errors.map((e) => <span key={e.feed} className="nw-err">{e.feed}: {e.error}</span>)}
          </nav>

          {view === 'brief' ? (
            <BriefingView unread={news.items.filter((i) => !news.read.has(i.id))} />
          ) : view === 'setup' ? (
            <SetupView onChanged={() => void news.refresh()} />
          ) : open ? (
            <article className="nw-reader">
              <div className="nw-reader-bar">
                <button className="ghost small" onClick={() => setOpen(null)}>‹ Back</button>
                <span className="spacer-flex" />
                <button className="ghost small" onClick={() => props.onAsk(`Read this article and tell me in 5 short points what matters for me as a developer, and whether anything in my current project should change because of it: ${open.link}`)}>Ask Claude</button>
                {open.link && <button className="small" onClick={() => void window.stm.openUrl(open.link)}>{open.video ? 'Watch on the site' : 'Open original'}</button>}
              </div>
              <div className="nw-reader-scroll">
                <div className="nw-reader-col">
                  <span className="nw-meta"><span className="nw-dot" style={{ background: `hsl(${hue(open.source)} 70% 58%)` }} />{open.source} · {ago(open.date)}</span>
                  <h1>{article?.title || open.title}</h1>
                  {open.video ? <div className="notice">A video: its title, channel and link only. It plays on the site; nothing is downloaded.</div> : article?.image || open.image ? <img className="nw-hero" src={article?.image ?? open.image} alt="" referrerPolicy="no-referrer" /> : <Cover item={open} />}
                  {open.aiSummary && <p className="nw-ai"><b>Summary</b> {open.aiSummary}</p>}
                  {!article && !articleErr && !open.video && <div className="faint"><span className="spinner" /> Making a clean copy...</div>}
                  {articleErr && <div className="notice error">Could not read the page ({articleErr}). Open the original.</div>}
                  {article && article.paragraphs.length === 0 && <p className="faint">{open.summary || 'This page has no readable text. Open the original.'}</p>}
                  {article?.paragraphs.map((p, i) => (p.startsWith('## ') ? <h2 key={i}>{p.slice(3)}</h2> : <p key={i}>{p}</p>))}
                </div>
              </div>
            </article>
          ) : (
            <div className="nw-grid">
              {!news.items.length && news.loading && Array.from({ length: 8 }, (_, i) => <div key={i} className="nw-card skeleton" />)}
              {shown.map((i, n) => (
                <button key={i.id} className={`nw-card ${news.read.has(i.id) ? 'read' : ''} ${n === 0 && !source ? 'lead' : ''}`} onClick={() => void openItem(i)}>
                  <Picture item={i} />
                  <span className="nw-meta"><span className="nw-dot" style={{ background: `hsl(${hue(i.source)} 70% 58%)` }} />{i.source} · {ago(i.date)}</span>
                  <span className="nw-title">{i.title}</span>
                  {(i.starred || i.video || i.newsletter) && <span className="nw-tags">{i.starred && <span className="nw-tag star">Starred</span>}{i.video && <span className="nw-tag">Video</span>}{i.newsletter && <span className="nw-tag">Newsletter</span>}</span>}
                  {i.aiSummary && <span className="nw-ai-card">{i.aiSummary}</span>}
                </button>
              ))}
              {news.items.length > 0 && !shown.length && <div className="note">Nothing new here.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
