// The floating mini player: a small frameless window that stays above every app, on every desktop and
// over full-screen apps, playing one YouTube video from where the drawer left it. It shares the
// drawer's YouTube sign-in, so Premium stays ad-free. Closing it hands the time back to the drawer.
import { BrowserWindow, screen } from 'electron'

let mini: BrowserWindow | null = null
const MARGIN = 24

/** The page of the player alone; a referrer, which the embed asks for, names the app's site. */
export function embedUrl(id: string, seconds: number) {
  return `https://www.youtube.com/embed/${id}?autoplay=1&start=${Math.max(0, Math.floor(seconds))}&rel=0&modestbranding=1&playsinline=1`
}

// a strip on top to drag the window by, and a close button; only shown while the pointer is over it
const CHROME_CSS = `#stm-mini-bar{position:fixed;left:0;right:0;top:0;height:30px;z-index:2147483647;-webkit-app-region:drag;display:flex;justify-content:flex-end;align-items:center;padding:0 6px;background:linear-gradient(rgba(0,0,0,.55),transparent);opacity:0;transition:opacity .18s}
html:hover #stm-mini-bar{opacity:1}
#stm-mini-bar button{-webkit-app-region:no-drag;width:22px;height:22px;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font:14px/22px -apple-system,system-ui,sans-serif;cursor:pointer}
#stm-mini-bar button:hover{background:#c15f3c}`
const CHROME_JS = (mark: string) => `if(!document.getElementById('stm-mini-bar')){const b=document.createElement('div');b.id='stm-mini-bar';const x=document.createElement('button');x.textContent='×';x.title='Close: the video goes back to the drawer';x.onclick=()=>console.info('${mark}');b.appendChild(x);document.body.appendChild(b)}`
const CLOSE_MARK = 'stm:mini-close'

/** Opens (or moves) the mini player; `back` gets the second it stopped at when it closes. */
export function openMini(p: { id: string; seconds: number; partition: string; back: (id: string, seconds: number) => void }) {
  if (mini && !mini.isDestroyed()) {
    void mini.loadURL(embedUrl(p.id, p.seconds), { httpReferrer: 'https://supertokenman.com/' })
    mini.show()
    return
  }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  const width = 480
  const height = 270
  mini = new BrowserWindow({
    width,
    height,
    x: area.x + area.width - width - MARGIN,
    y: area.y + area.height - height - MARGIN,
    minWidth: 256,
    minHeight: 144,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    hasShadow: true,
    backgroundColor: '#000000',
    title: 'Mini player',
    webPreferences: { partition: p.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  const w = mini
  w.setAspectRatio(16 / 9)
  // above full-screen apps and on every desktop, like a picture in picture
  w.setAlwaysOnTop(true, 'floating')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  const wc = w.webContents
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (e, next) => {
    if (!/^https:\/\/www\.youtube\.com\/embed\//.test(next)) e.preventDefault()
  })
  wc.on('did-finish-load', () => {
    void wc.insertCSS(CHROME_CSS)
    void wc.executeJavaScript(CHROME_JS(CLOSE_MARK)).catch(() => undefined)
  })
  wc.on('console-message', (e) => {
    if ((e as unknown as { message?: string }).message === CLOSE_MARK) w.close()
  })
  let id = p.id
  let at = p.seconds
  wc.on('did-navigate', (_e, url) => {
    const m = /\/embed\/([\w-]{11})/.exec(url)
    if (m) id = m[1]!
  })
  // keep the time, so closing can hand it back even if the page is already gone
  const tick = setInterval(() => {
    if (wc.isDestroyed()) return
    void wc.executeJavaScript(`(document.querySelector('video')||{}).currentTime||0`).then((t: number) => (at = t || at)).catch(() => undefined)
  }, 1000)
  w.on('closed', () => {
    clearInterval(tick)
    mini = null
    p.back(id, at)
  })
  void w.loadURL(embedUrl(p.id, p.seconds), { httpReferrer: 'https://supertokenman.com/' })
}
