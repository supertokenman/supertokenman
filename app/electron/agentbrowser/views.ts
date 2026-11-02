// The tabs of the agent browser: one WebContentsView per tab, per panel, in the panel's own session
// partition (never the default session). Each view is sandboxed, has no preload and no node, and every
// permission (camera, microphone, location, notifications, clipboard) is denied. A popup becomes a tab of
// the same panel. Caps: 3 tabs per panel, 6 views app-wide; a view idle for 10 minutes is discarded (its
// URL is kept and it reloads on the next use). Every main-frame request, redirects included, goes through
// `gate` before it leaves; subresources of other hosts are allowed and only reported.
import { mkdirSync, rmSync } from 'node:fs'
import { session, WebContentsView, type BrowserWindow, type Session as ElectronSession, type WebContents } from 'electron'
import { canOpenTab, idleViews, MAX_VIEWS } from '../../shared/browsersession.js'
import { Cdp } from './cdp.js'

export type Rect = { x: number; y: number; width: number; height: number }
export type Tab = {
  id: number
  panel: string
  view: WebContentsView | null
  cdp: Cdp | null
  url: string
  title: string
  loading: boolean
  lastUsed: number
  /** last main-frame response, for the challenge classifier */
  status?: number
  headers: Record<string, string>
}

export type ViewsDeps = {
  win: () => BrowserWindow | null
  partitionOf: (panel: string) => string
  /** a main-frame request: true lets it go, false cancels it. May ask the person. */
  gate: (panel: string, url: string) => Promise<boolean>
  /** a popup the page opened, after the gate; becomes a tab */
  popup: (panel: string, url: string) => void
  /** a download the page started; the answer decides whether it is kept */
  download: (panel: string, info: { name: string; size: number; host: string }) => Promise<boolean>
  downloadDir: (panel: string) => string
  /** a subresource request to another host */
  net: (panel: string, host: string) => void
  /** a file chooser the page asked for, which was not opened */
  chooser: (panel: string) => void
  changed: (panel: string) => void
  now: () => number
}

const DEFAULT_SIZE = { width: 1280, height: 800 }

export class Views {
  private tabs = new Map<string, Tab[]>()
  private active = new Map<string, number>()
  private rects = new Map<string, Rect | null>()
  private byContents = new Map<number, Tab>()
  private configured = new Set<string>()
  private seq = 0
  private timer: NodeJS.Timeout | null = null

  constructor(private d: ViewsDeps) {}

  list(panel: string): Tab[] {
    return this.tabs.get(panel) ?? []
  }
  total(): number {
    return [...this.tabs.values()].reduce((n, t) => n + t.filter((x) => x.view).length, 0)
  }
  activeId(panel: string): number | undefined {
    return this.active.get(panel)
  }
  get(panel: string, id?: number): Tab | undefined {
    const list = this.list(panel)
    return list.find((t) => t.id === (id ?? this.active.get(panel)))
  }
  panels(): string[] {
    return [...this.tabs.keys()]
  }

  private configure(partition: string): ElectronSession {
    const ses = session.fromPartition(partition)
    if (this.configured.has(partition)) return ses
    this.configured.add(partition)
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
    ses.setPermissionCheckHandler(() => false)
    ses.setDevicePermissionHandler(() => false)
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
      const tab = details.webContentsId === undefined ? undefined : this.byContents.get(details.webContentsId)
      if (!tab) return cb({})
      if (details.resourceType !== 'mainFrame') {
        try {
          this.d.net(tab.panel, new URL(details.url).host)
        } catch {
          // not a URL
        }
        return cb({})
      }
      this.d.gate(tab.panel, details.url).then(
        (ok) => cb(ok ? {} : { cancel: true }),
        () => cb({ cancel: true }),
      )
    })
    ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
      const tab = details.webContentsId === undefined ? undefined : this.byContents.get(details.webContentsId)
      if (tab && details.resourceType === 'mainFrame') {
        tab.status = details.statusCode
        tab.headers = Object.fromEntries(Object.entries(details.responseHeaders ?? {}).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v)]))
      }
      cb({})
    })
    ses.on('will-download', (_e, item, wc) => {
      const tab = this.byContents.get(wc.id)
      if (!tab) return item.cancel()
      const name = item.getFilename().replace(/[^\w.-]+/g, '_').slice(0, 120) || 'download'
      const dir = this.d.downloadDir(tab.panel)
      // the file is written to a held path first; the person's answer keeps or removes it
      mkdirSync(dir, { recursive: true })
      const path = `${dir}/${name}`
      item.setSavePath(path)
      item.pause()
      let host = ''
      try {
        host = new URL(item.getURL()).host
      } catch {
        // keep empty
      }
      this.d.download(tab.panel, { name, size: item.getTotalBytes(), host }).then((ok) => {
        if (ok) item.resume()
        else {
          item.cancel()
          try {
            rmSync(path, { force: true })
          } catch {
            // nothing was written yet
          }
        }
      })
    })
    return ses
  }

  /** Opens a tab. Throws a message for the model when a cap is reached. */
  open(panel: string, url?: string): Tab {
    const own = this.list(panel)
    const why = canOpenTab(own.filter((t) => t.view).length, this.total())
    if (why) throw new Error(why)
    const tab: Tab = { id: ++this.seq, panel, view: null, cdp: null, url: url ?? '', title: '', loading: false, lastUsed: this.d.now(), headers: {} }
    this.tabs.set(panel, [...own, tab])
    this.live(tab)
    this.active.set(panel, tab.id)
    this.layout(panel)
    this.d.changed(panel)
    return tab
  }

  /** Makes sure the tab has a view (a discarded tab is rebuilt and reloads its URL). */
  live(tab: Tab): WebContentsView {
    if (tab.view) {
      tab.lastUsed = this.d.now()
      return tab.view
    }
    const ses = this.configure(this.d.partitionOf(tab.panel))
    void ses
    const view = new WebContentsView({
      webPreferences: { partition: this.d.partitionOf(tab.panel), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, spellcheck: false },
    })
    const wc = view.webContents
    tab.view = view
    tab.cdp = new Cdp(wc)
    tab.cdp.onFileChooser = () => this.d.chooser(tab.panel)
    tab.lastUsed = this.d.now()
    this.byContents.set(wc.id, tab)
    wc.setWindowOpenHandler(({ url }) => {
      this.d.popup(tab.panel, url)
      return { action: 'deny' }
    })
    const refuseOther = (e: { preventDefault: () => void }, url: string) => {
      if (!/^https?:/i.test(url) && url !== 'about:blank') e.preventDefault()
    }
    wc.on('will-navigate', (e) => refuseOther(e, e.url))
    wc.on('will-redirect', (e) => refuseOther(e, e.url))
    wc.on('did-start-loading', () => ((tab.loading = true), tab.cdp?.reset(), this.d.changed(tab.panel)))
    wc.on('did-stop-loading', () => ((tab.loading = false), (tab.url = wc.getURL() || tab.url), (tab.title = wc.getTitle()), this.d.changed(tab.panel)))
    wc.on('page-title-updated', () => ((tab.title = wc.getTitle()), this.d.changed(tab.panel)))
    wc.on('did-navigate', () => ((tab.url = wc.getURL()), tab.cdp?.reset()))
    wc.on('did-navigate-in-page', () => (tab.url = wc.getURL()))
    // DevTools opened by the person take the debugger; the driver attaches again on the next action
    wc.on('devtools-opened', () => undefined)
    const w = this.d.win()
    if (w && !w.isDestroyed()) w.contentView.addChildView(view)
    view.setBounds({ x: 0, y: 0, ...DEFAULT_SIZE })
    view.setVisible(false)
    // a discarded tab comes back on its last address
    if (tab.url) void wc.loadURL(tab.url).catch(() => undefined)
    return view
  }

  switchTo(panel: string, id: number): boolean {
    if (!this.list(panel).some((t) => t.id === id)) return false
    this.active.set(panel, id)
    this.layout(panel)
    this.d.changed(panel)
    return true
  }

  close(panel: string, id: number): boolean {
    const list = this.list(panel)
    const tab = list.find((t) => t.id === id)
    if (!tab) return false
    this.destroy(tab)
    const rest = list.filter((t) => t.id !== id)
    this.tabs.set(panel, rest)
    if (this.active.get(panel) === id) {
      if (rest.length) this.active.set(panel, rest[rest.length - 1]!.id)
      else this.active.delete(panel)
    }
    this.layout(panel)
    this.d.changed(panel)
    return true
  }

  private destroy(tab: Tab) {
    const view = tab.view
    if (!view) return
    const wc = view.webContents
    this.byContents.delete(wc.id)
    tab.cdp?.dispose()
    tab.cdp = null
    tab.view = null
    try {
      const w = this.d.win()
      if (w && !w.isDestroyed()) w.contentView.removeChildView(view)
      if (!wc.isDestroyed()) (wc as WebContents & { close: () => void }).close()
    } catch {
      // the window is closing
    }
  }

  /** The pane sits at `rect` (null hides it); only the active tab shows. */
  setBounds(panel: string, rect: Rect | null) {
    this.rects.set(panel, rect)
    this.layout(panel)
  }

  private layout(panel: string) {
    const rect = this.rects.get(panel) ?? null
    for (const t of this.list(panel)) {
      if (!t.view) continue
      const show = Boolean(rect) && t.id === this.active.get(panel)
      if (rect) t.view.setBounds({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) })
      t.view.setVisible(show)
    }
  }

  /** Discards the views idle for 10 minutes; their tabs and URLs stay. */
  sweep(): string[] {
    const now = this.d.now()
    const used: Record<string, number> = {}
    for (const ts of this.tabs.values()) for (const t of ts) if (t.view) used[`${t.panel}#${t.id}`] = t.lastUsed
    const gone = idleViews(used, now)
    for (const key of gone) {
      const [panel, id] = key.split('#') as [string, string]
      const tab = this.get(panel, Number(id))
      if (tab) {
        tab.url = tab.view?.webContents.getURL() || tab.url
        this.destroy(tab)
      }
    }
    return gone
  }

  startSweeper(): void {
    this.timer ??= setInterval(() => this.sweep(), 60_000)
    this.timer.unref()
  }

  /** Closes every tab of a panel (the panel closed, or the feature was turned off). */
  closePanel(panel: string) {
    for (const t of this.list(panel)) this.destroy(t)
    this.tabs.delete(panel)
    this.active.delete(panel)
    this.rects.delete(panel)
  }

  closeAll() {
    for (const p of [...this.tabs.keys()]) this.closePanel(p)
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Wipes a named profile's storage (the profile was deleted). */
  async clearPartition(partition: string) {
    const ses = session.fromPartition(partition)
    await ses.clearStorageData()
    await ses.clearCache()
  }

  /** Wipes the cookies and storage of the panel's partition (browse:clear for the agent's browser). */
  async clear(panel: string) {
    this.closePanel(panel)
    const ses = session.fromPartition(this.d.partitionOf(panel))
    await ses.clearStorageData()
    await ses.clearCache()
  }
}

export { MAX_VIEWS }
