// Links in Claude's replies open here, in a window of the app, not in the browser. A plain sandboxed
// page with no preload and its own session, so a page read here never sees the app or its sign-ins.
// A bar on top names the address and offers the browser, for when a page needs it.
import { BrowserWindow, shell } from 'electron'

let reader: BrowserWindow | null = null
const MARK = 'stm:reader-browser'
const isWeb = (u: string) => /^https?:\/\//i.test(u)

const BAR_CSS = `#stm-reader-bar{position:fixed;left:0;right:0;top:0;height:34px;z-index:2147483647;display:flex;align-items:center;gap:10px;padding:0 10px;background:#141413;color:#c9c5bc;font:12px/34px -apple-system,system-ui,sans-serif;box-shadow:0 1px 0 #3a3833}
#stm-reader-bar span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,Menlo,monospace}
#stm-reader-bar button{height:24px;padding:0 10px;border:1px solid #3a3833;border-radius:6px;background:#1f1e1b;color:#f4efe6;font:12px -apple-system,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
#stm-reader-bar button:hover{border-color:#c15f3c}
html{margin-top:34px!important}`
const BAR_JS = `if(!document.getElementById('stm-reader-bar')){const b=document.createElement('div');b.id='stm-reader-bar';const s=document.createElement('span');s.textContent=location.href;const o=document.createElement('button');o.textContent='Open in browser';o.onclick=()=>console.info('${MARK}');b.append(s,o);document.documentElement.appendChild(b)}`

/** Opens a web address in the app's reader window, reusing it when it is already open. */
export function openReader(url: string) {
  if (!isWeb(url)) return false
  if (reader && !reader.isDestroyed()) {
    void reader.loadURL(url)
    reader.show()
    reader.focus()
    return true
  }
  const w = new BrowserWindow({
    width: 1040,
    height: 760,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    title: 'Reader',
    webPreferences: { partition: 'reader', sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  reader = w
  const wc = w.webContents
  // a link that wants a new window stays in this one
  wc.setWindowOpenHandler(({ url: next }) => {
    if (isWeb(next)) void wc.loadURL(next)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, next) => {
    if (!isWeb(next)) e.preventDefault()
  })
  wc.on('did-finish-load', () => {
    void wc.insertCSS(BAR_CSS)
    void wc.executeJavaScript(BAR_JS).catch(() => undefined)
  })
  wc.on('console-message', (e) => {
    if ((e as unknown as { message?: string }).message === MARK) void shell.openExternal(wc.getURL())
  })
  w.on('closed', () => (reader = null))
  void w.loadURL(url)
  return true
}
