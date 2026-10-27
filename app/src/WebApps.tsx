import { useEffect, useRef, useState } from 'react'
import { youtubeId } from '../shared/video'
import { siteApp, unreadOf, WEB_APPS, type Site, type SiteInput } from '../shared/webapps'
import { EmptyState } from './EmptyState'
import { clean } from './errors'
import { hasSkin, SKINS } from '../shared/skins'
import { DARKEN_CSS, isLight, PAGE_BG_JS } from '../shared/darken'
import { IconBadge, IconCalendar, IconCamera, IconCar, IconChat, IconCrew, IconHash, IconPeople, IconFood, IconSpark, IconThreads, IconInbox, IconMail, IconPlay, IconClose } from './icons'

export const APP_ICONS: Record<string, () => JSX.Element> = { slack: IconHash, discord: IconCrew, teams: IconPeople, calendar: IconCalendar, meet: IconCamera, whatsapp: IconChat, gmail: IconMail, outlook: IconInbox, ifood: IconFood, uber: IconCar, linkedin: IconBadge, x: IconSpark, reddit: IconThreads, youtube: IconPlay }

type View = HTMLWebViewElement & { reload(): void; goBack(): void; canGoBack(): boolean; getURL(): string; isCurrentlyAudible(): boolean; executeJavaScript(code: string): Promise<unknown>; insertCSS(css: string): Promise<string>; removeInsertedCSS(key: string): Promise<void> }

/** Apps that stay loaded however long they are hidden; by default the ones that bring messages. */
const KEEP_KEY = 'stm.keepAwake'
// only WhatsApp by default: each kept app holds 150 to 350 MB all day (measured); pin the others as needed
const DEFAULT_KEEP = ['whatsapp']
const loadKeep = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEEP_KEY) || 'null') ?? DEFAULT_KEEP
  } catch {
    return DEFAULT_KEEP
  }
}
const IDLE_MS = 10 * 60_000

/** One app's page. Mounted the first time it is picked and kept, so its session and playback go on. */
function AppView(props: { id: string; url: string; css?: string; shown: boolean; dark: boolean; skin: boolean; onTitle: (t: string) => void; viewRef: (v: View | null) => void }) {
  const ref = useRef<View>(null)
  const onTitle = useRef(props.onTitle)
  onTitle.current = props.onTitle
  useEffect(() => {
    const el = ref.current
    if (!el) return
    props.viewRef(el)
    const on = (e: Event) => onTitle.current((e as Event & { title: string }).title)
    el.addEventListener('page-title-updated', on)
    return () => el.removeEventListener('page-title-updated', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // our skin on the sites that have one: only style goes in, nothing on the page is read
  const skinKey = useRef<string | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !hasSkin(props.id)) return
    const apply = async () => {
      try {
        if (skinKey.current) await el.removeInsertedCSS(skinKey.current).catch(() => undefined)
        skinKey.current = props.skin ? await el.insertCSS(SKINS[props.id]!) : null
      } catch {
        // still loading: dom-ready applies it
      }
    }
    const reset = () => {
      skinKey.current = null
      void apply()
    }
    el.addEventListener('dom-ready', reset)
    void apply()
    return () => el.removeEventListener('dom-ready', reset)
  }, [props.skin, props.id])
  // a site added as an app: the person's own CSS on each load (hide a banner, widen a column)
  const cssKey = useRef<string | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !props.css) return
    const css = props.css
    const apply = async () => {
      try {
        if (cssKey.current) await el.removeInsertedCSS(cssKey.current).catch(() => undefined)
        cssKey.current = await el.insertCSS(css)
      } catch {
        // still loading: dom-ready applies it
      }
    }
    const reset = () => {
      cssKey.current = null
      void apply()
    }
    el.addEventListener('dom-ready', reset)
    return () => {
      el.removeEventListener('dom-ready', reset)
      if (cssKey.current) void el.removeInsertedCSS(cssKey.current).catch(() => undefined)
      cssKey.current = null
    }
  }, [props.css])
  // a light page is darkened to match the app; checked on each load and every 8 s, as pages switch themes
  const darkKey = useRef<string | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    const check = async () => {
      try {
        const want = props.dark && !(props.skin && hasSkin(props.id)) && isLight(String(await el.executeJavaScript(PAGE_BG_JS)))
        if (!alive) return
        if (want && !darkKey.current) darkKey.current = await el.insertCSS(DARKEN_CSS)
        else if (!want && darkKey.current) {
          await el.removeInsertedCSS(darkKey.current)
          darkKey.current = null
        }
      } catch {
        // the page is loading or gone: the next check catches up
      }
    }
    const reset = () => {
      darkKey.current = null
      void check()
    }
    el.addEventListener('dom-ready', reset)
    el.addEventListener('did-stop-loading', check)
    const t = setInterval(() => void check(), 8000)
    void check()
    return () => {
      alive = false
      clearInterval(t)
      el.removeEventListener('dom-ready', reset)
      el.removeEventListener('did-stop-loading', check)
    }
  }, [props.dark, props.skin, props.id])
  return <webview ref={ref} {...({ allowpopups: "true" } as object)} src={props.url} partition={`persist:${props.id}`} className={`wa-view ${props.shown ? '' : 'hidden'}`} aria-hidden={!props.shown} />
}

/**
 * The user's own web apps in a drawer: WhatsApp, Gmail, Outlook, YouTube. Each keeps its own login
 * (persist:<id>). Claude does not read or send anything in them.
 */
export function WebAppsDrawer(props: { open: boolean; app: string; width: number; onApp: (id: string) => void; onUnread: (byApp: Record<string, number>) => void; onResize: (w: number) => void; onClose: () => void }) {
  const [mounted, setMounted] = useState<string[]>([props.app])
  const [sites, setSites] = useState<Site[]>([])
  const [editing, setEditing] = useState<Site | 'new' | null>(null)
  useEffect(() => void window.stm.sites.list().then(setSites, () => undefined), [])
  const apps = [...WEB_APPS, ...sites.map(siteApp)]
  // The slide is a transform over the panels; the panel grid gives up its width once, at rest.
  // Opening: slide in over the panels, then dock (one reflow, under a still drawer).
  // Closing: undock first (one reflow, hidden under the drawer), then slide out.
  const [slid, setSlid] = useState(false)
  const [docked, setDocked] = useState(false)
  const [gone, setGone] = useState(true)
  const sheet = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (props.open) {
      setGone(false)
      // two frames: the sheet is laid out off-screen first, so the slide has somewhere to start from
      let f = requestAnimationFrame(() => (f = requestAnimationFrame(() => setSlid(true))))
      // no transition (reduced motion) means no transitionend: dock anyway
      const t = window.setTimeout(() => setDocked(true), 600)
      return () => (cancelAnimationFrame(f), window.clearTimeout(t))
    }
    setDocked(false)
    setSlid(false)
  }, [props.open])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const views = useRef<Record<string, View | null>>({})
  const [lightApps, setLightApps] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('stm.lightApps') || '[]') as string[]
    } catch {
      return []
    }
  })
  // our skin is on by default where there is one; the person can see the site's own look instead
  const [plainApps, setPlainApps] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('stm.plainApps') || '[]') as string[]
    } catch {
      return []
    }
  })
  const toggleSkin = (id: string) => {
    const next = plainApps.includes(id) ? plainApps.filter((x) => x !== id) : [...plainApps, id]
    setPlainApps(next)
    try {
      localStorage.setItem('stm.plainApps', JSON.stringify(next))
    } catch {
      // just this session
    }
  }
  const toggleDark = (id: string) => {
    const next = lightApps.includes(id) ? lightApps.filter((x) => x !== id) : [...lightApps, id]
    setLightApps(next)
    try {
      localStorage.setItem('stm.lightApps', JSON.stringify(next))
    } catch {
      // storage off: the choice lasts this session
    }
  }
  const [keep, setKeep] = useState(loadKeep)
  const keepRef = useRef(keep)
  keepRef.current = keep
  const toggleKeep = (id: string) => {
    const next = keep.includes(id) ? keep.filter((x) => x !== id) : [...keep, id]
    setKeep(next)
    try {
      localStorage.setItem(KEEP_KEY, JSON.stringify(next))
    } catch {
      // storage off: the choice lasts this session
    }
  }
  // each hidden app is a whole browser tab in memory (measured 100 to 320 MB): after 10 minutes unseen, and silent, it sleeps
  const seen = useRef<Record<string, number>>({})
  seen.current[props.open ? props.app : ''] = Date.now()
  useEffect(() => {
    const t = setInterval(() => {
      setMounted((m) => {
        const keep = m.filter((id) => {
          if (keepRef.current.includes(id) || (id === props.app && props.open)) return true
          let audible = false
          try {
            audible = views.current[id]?.isCurrentlyAudible() ?? false
          } catch {
            audible = false
          }
          return audible || Date.now() - (seen.current[id] ?? 0) < IDLE_MS
        })
        return keep.length === m.length ? m : keep
      })
    }, 60_000)
    return () => clearInterval(t)
  }, [props.app, props.open])
  const onUnread = useRef(props.onUnread)
  onUnread.current = props.onUnread
  useEffect(() => {
    if (!mounted.includes(props.app)) setMounted([...mounted, props.app])
  }, [props.app, mounted])
  useEffect(() => {
    onUnread.current(unread)
  }, [unread])
  const [pending, setPending] = useState<{ app: string; url: string } | null>(null)
  useEffect(() => {
    if (!pending) return
    const v = views.current[pending.app]
    if (v) {
      ;(v as View & { loadURL(u: string): Promise<void> }).loadURL(pending.url).catch(() => undefined)
      setPending(null)
    }
  })
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ app: string; url: string }>).detail
      props.onApp(d.app)
      setMounted((m) => (m.includes(d.app) ? m : [...m, d.app]))
      setPending(d)
    }
    // Health puts an app to sleep: its page unloads until it is opened again
    const sleep = (e: Event) => {
      const app = (e as CustomEvent<{ app: string }>).detail.app
      setMounted((m) => m.filter((x) => x !== app || (x === props.app && props.open)))
    }
    window.addEventListener('stm:webapp', on)
    window.addEventListener('stm:webapp-sleep', sleep)
    return () => {
      window.removeEventListener('stm:webapp', on)
      window.removeEventListener('stm:webapp-sleep', sleep)
    }
  }, [props])

  const drag = (e: React.MouseEvent) => {
    // resizing follows the pointer at once; the open and close glide stays for those
    const aside = sheet.current?.parentElement
    aside?.classList.add('dragging')
    sheet.current?.classList.add('dragging')
    const start = e.clientX
    const w0 = props.width
    const move = (ev: MouseEvent) => props.onResize(Math.max(340, Math.min(1100, w0 + (start - ev.clientX))))
    const up = () => {
      aside?.classList.remove('dragging')
      sheet.current?.classList.remove('dragging')
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const current = apps.find((a) => a.id === props.app) ?? WEB_APPS[0]!
  const currentSite = sites.find((x) => x.id === current.id)
  const view = () => views.current[current.id]
  // the video on screen in the YouTube drawer, if any, for the mini player
  const [video, setVideo] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => {
      const v = views.current.youtube
      try {
        setVideo(v ? youtubeId(v.getURL()) : null)
      } catch {
        setVideo(null)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [])
  // the mini player hands the second it stopped at back to the drawer
  useEffect(
    () =>
      window.stm.mini.onClosed(({ id, seconds }) => {
        const v = views.current.youtube
        if (v && youtubeId(v.getURL()) === id) void v.executeJavaScript(`(()=>{const m=document.querySelector('video');if(m){m.currentTime=${Number(seconds) || 0}}})()`).catch(() => undefined)
      }),
    [],
  )
  const float = async () => {
    const v = views.current.youtube
    if (!v) return
    const at = (await v.executeJavaScript(`(()=>{const m=document.querySelector('video');if(!m)return 0;m.pause();return m.currentTime})()`).catch(() => 0)) as number
    void window.stm.mini.open(v.getURL(), at)
  }

  return (
    <aside className={`wa ${docked ? 'docked' : ''}`} style={{ width: docked ? props.width : 0 }} aria-hidden={!props.open}>
      <div
        ref={sheet}
        className={`wa-sheet ${slid ? 'open' : ''} ${gone && !props.open ? 'gone' : ''}`}
        style={{ width: props.width }}
        onTransitionEnd={(e) => {
          if (e.target !== e.currentTarget || e.propertyName !== 'transform') return
          if (props.open) setDocked(true)
          else setGone(true)
        }}
      >
      <div className="wa-grip" onMouseDown={drag} />
      <header className="wa-head">
        <div className="wa-apps" role="tablist" aria-label="Apps">
          {apps.map((a) => {
            const site = sites.find((x) => x.id === a.id)
            const Ico = APP_ICONS[a.id] ?? (() => (site?.icon ? <img className="wa-site-icon" src={site.icon} alt="" /> : <span className="wa-site-mono" aria-hidden="true">{a.name.slice(0, 1).toUpperCase()}</span>))
            const n = unread[a.id] ?? 0
            return (
              <button key={a.id} role="tab" aria-selected={a.id === current.id && !editing} className={`wa-app app-${a.id}`} title={a.name} onClick={() => (setEditing(null), props.onApp(a.id))}>
                <Ico />
                <span className="wa-app-name">{a.name}</span>
                {n > 0 && <span className="count">{n > 99 ? '99+' : n}</span>}
              </button>
            )
          })}
          <button className={`wa-app wa-add ${editing === 'new' ? 'on' : ''}`} title="Add a site as an app" aria-label="Add a site as an app" onClick={() => setEditing('new')}>
            <span className="wa-site-mono" aria-hidden="true">+</span>
            <span className="wa-app-name">Add site</span>
          </button>
        </div>
        <span className="spacer-flex" />
        {currentSite && !editing && <button className="ghost small" title={`Edit ${currentSite.name}: address, CSS, user agent`} onClick={() => setEditing(currentSite)}>Edit</button>}
        {current.id === 'youtube' && video && (
          <button className="wa-float" title="Keep this video in a small window above every app, even full-screen ones" onClick={() => void float()}>
            <svg width="13" height="11" viewBox="0 0 13 11" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="0.7" y="0.7" width="11.6" height="9.6" rx="1" /><rect x="6.2" y="5" width="5" height="4" fill="currentColor" stroke="none" /></svg>
            Float
          </button>
        )}
        {hasSkin(current.id) && (
          <button className={`wa-skin ${plainApps.includes(current.id) ? '' : 'on'}`} title={plainApps.includes(current.id) ? `${current.name} in its own look. Click for the app's look: our colors and font, without the side columns.` : `${current.name} in the app's look. Only style is added; nothing on the page is read. Click for the site's own look.`} aria-pressed={!plainApps.includes(current.id)} onClick={() => toggleSkin(current.id)}>
            {plainApps.includes(current.id) ? 'Site look' : 'Our look'}
          </button>
        )}
        <button className={`icon keep ${lightApps.includes(current.id) ? '' : 'on'}`} title={lightApps.includes(current.id) ? `${current.name} shows in its own colors. Click to match the app's dark look.` : `${current.name} is darkened to match the app when the page is light. Click for its own colors.`} aria-pressed={!lightApps.includes(current.id)} onClick={() => toggleDark(current.id)}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 7.2A4.25 4.25 0 1 1 4.8 2a3.4 3.4 0 0 0 5.2 5.2z" /></svg>
        </button>
        <button className={`icon keep ${keep.includes(current.id) ? 'on' : ''}`} title={keep.includes(current.id) ? `${current.name} stays loaded while hidden (uses memory). Click to let it sleep after 10 minutes.` : `${current.name} sleeps after 10 minutes hidden. Click to keep it loaded.`} aria-pressed={keep.includes(current.id)} onClick={() => toggleKeep(current.id)}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 1.5h4l-.5 3 2 2H2.5l2-2zM6 6.5V11" /></svg>
        </button>
        <button className="icon" title="Back" aria-label="Back" onClick={() => view()?.canGoBack() && view()?.goBack()}>‹</button>
        <button className="icon" title="Reload" aria-label="Reload" onClick={() => view()?.reload()}>↻</button>
        <button className="icon" title="Open in browser" aria-label="Open in browser" onClick={() => void window.stm.openUrl(view()?.getURL() || current.url)}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 2H2.5v7.5H10V7M7 1.5h3.5V5M10.5 1.5 5.5 6.5" /></svg>
        </button>
        <button className="icon" aria-label="Close drawer" onClick={props.onClose}>
          <IconClose />
        </button>
      </header>
      <div className="wa-body">
        {editing && (
          <SiteForm
            key={editing === 'new' ? 'new' : editing.id}
            site={editing === 'new' ? null : editing}
            count={sites.length}
            onCancel={() => setEditing(null)}
            onSaved={(list, id) => (setSites(list), setEditing(null), props.onApp(id))}
            onRemoved={(list) => (setSites(list), setEditing(null), setMounted((m) => m.filter((x) => list.some((s) => s.id === x) || WEB_APPS.some((w) => w.id === x))), props.onApp(WEB_APPS[0]!.id))}
          />
        )}
        {mounted.map((id) => {
          const a = apps.find((x) => x.id === id)
          if (!a) return null
          return (
            <AppView key={`${id}:${a.url}`} id={id} url={a.url} css={sites.find((x) => x.id === id)?.css} shown={id === current.id && !editing} dark={!lightApps.includes(id)} skin={!plainApps.includes(id)} viewRef={(v) => (views.current[id] = v)} onTitle={(t) => setUnread((u) => (u[id] === unreadOf(t) ? u : { ...u, [id]: unreadOf(t) }))} />
          )
        })}
        <div className="wa-foot faint">{current.hint} Claude does not read or send anything here.</div>
      </div>
      </div>
    </aside>
  )
}

/** Add a site as an app, or edit one: name, address, optional icon, CSS and user agent. */
function SiteForm(props: { site: Site | null; count: number; onCancel: () => void; onSaved: (list: Site[], id: string) => void; onRemoved: (list: Site[]) => void }) {
  const [f, setF] = useState<SiteInput>(() => ({ name: props.site?.name ?? '', url: props.site?.url ?? 'https://', css: props.site?.css ?? '', ua: props.site?.ua ?? '', alsoHosts: (props.site?.hosts ?? []).slice(1).join(', ') }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const list = await window.stm.sites.save(f, props.site?.id)
      const id = props.site?.id ?? list[list.length - 1]!.id
      props.onSaved(list, id)
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
  }
  return (
    <div className="wa-siteform cutfields">
      <div className="sheet-title">{props.site ? `Edit ${props.site.name}` : 'Add a site as an app'}</div>
      {!props.site && props.count === 0 && <EmptyState title="No sites added yet" text="Any https site can live in the drawer like the apps above: its own storage and login, held to its own address. Its icon is fetched once, now, from the site." />}
      {err && <div className="notice error">{err}</div>}
      <label className="wa-field">Name<input id="site-name" value={f.name} placeholder="e.g. Linear" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="wa-field">Address<input id="site-url" value={f.url} spellCheck={false} placeholder="https://linear.app/" onChange={(e) => setF({ ...f, url: e.target.value })} /></label>
      <label className="wa-field">Also allow these hosts <span className="faint">optional, e.g. the sign-in provider</span><input id="site-hosts" value={f.alsoHosts} spellCheck={false} placeholder="accounts.google.com, auth0.com" onChange={(e) => setF({ ...f, alsoHosts: e.target.value })} /></label>
      <label className="wa-field">Custom CSS <span className="faint">optional, put in on each load</span><textarea id="site-css" value={f.css} spellCheck={false} placeholder={'.cookie-banner, .promo { display: none !important; }'} onChange={(e) => setF({ ...f, css: e.target.value })} /></label>
      <label className="wa-field">User agent <span className="faint">optional; empty keeps the drawer default</span><input id="site-ua" value={f.ua} spellCheck={false} onChange={(e) => setF({ ...f, ua: e.target.value })} /></label>
      <div className="faint">Each site keeps its own cookies and login, runs sandboxed without access to this Mac, and links to other hosts open in your browser. Claude does not read or send anything in it.</div>
      <div className="dep-row">
        {props.site && <button className="ghost small danger" disabled={busy} onClick={() => void window.stm.sites.remove(props.site!.id).then(props.onRemoved, (e) => setErr(clean(e)))}>Remove and sign out</button>}
        <span className="spacer-flex" />
        <button className="ghost small" onClick={props.onCancel}>Cancel</button>
        <button className="primary small" disabled={busy || !f.name.trim() || f.url.trim().length < 10} onClick={() => void save()}>{busy ? <span className="spinner" /> : props.site ? 'Save' : 'Add app'}</button>
      </div>
    </div>
  )
}
