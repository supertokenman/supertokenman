// Hardening of the main process (phase 76): only the app's own page may use IPC, the main session
// grants only the permissions the app needs, and helpers the packaging step uses for Electron fuses.
import { extname, join, normalize, sep } from 'node:path'
import { ipcMain, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { checkArgs } from '../shared/ipccontract.js'

/** The built window is served from stmui://app/, not file://: with the GrantFileProtocolExtraPrivileges
 * fuse off, file:// cannot read inside app.asar, so the window stayed black in the packaged app. */
export const UI_SCHEME = 'stmui'
export const UI_URL = `${UI_SCHEME}://app/index.html`
export const UI_ORIGIN = `${UI_SCHEME}://app`

/** The page allowed to call into the main process: the built index.html, or the dev server in dev. */
export function trustedFrame(url: string | undefined, dev: boolean): boolean {
  if (!url) return false
  if (dev && /^http:\/\/localhost:5173(\/|$)/.test(url)) return true
  return /^stmui:\/\/app\/index\.html(?:[?#].*)?$/.test(url)
}

const UI_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm',
}

/** The file a stmui:// request names inside the built UI folder, or null for another host or a path that leaves it. */
export function uiFile(dir: string, url: string): { path: string; type: string } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== `${UI_SCHEME}:` || u.host !== 'app') return null
  let rel: string
  try {
    rel = decodeURIComponent(u.pathname)
  } catch {
    return null
  }
  if (rel === '/' || rel === '') rel = '/index.html'
  const root = normalize(dir)
  const path = normalize(join(root, rel))
  if (!path.startsWith(root + sep)) return null
  return { path, type: UI_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream' }
}

/**
 * Every ipcMain.handle and ipcMain.on registered after this checks the sender: a frame that is not the
 * app's own page (a web app in the drawer, a page in Preview, an iframe) gets an error, not the handler.
 */
let onIpcError: ((channel: string, err: unknown) => void) | null = null
/** Where failed IPC calls are reported (the local error log); set once the log exists. */
export const reportIpcErrors = (fn: (channel: string, err: unknown) => void) => void (onIpcError = fn)

export function guardIpc(dev: boolean) {
  const handle = ipcMain.handle.bind(ipcMain)
  const on = ipcMain.on.bind(ipcMain)
  ipcMain.handle = ((channel: string, fn: (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown) =>
    handle(channel, (e, ...a) => {
      if (!trustedFrame(e.senderFrame?.url, dev)) {
        const err = new Error(`Refused: ${channel} from a page that is not the app.`)
        onIpcError?.(channel, err)
        throw err
      }
      // phase 81: the arguments of a sensitive channel must fit its contract
      const bad = checkArgs(channel, a)
      if (bad) {
        const err = new Error(`Refused: ${channel} got ${bad}.`)
        onIpcError?.(channel, err)
        throw err
      }
      try {
        const r = fn(e, ...a)
        return r instanceof Promise ? r.catch((err: unknown) => (onIpcError?.(channel, err), Promise.reject(err))) : r
      } catch (err) {
        onIpcError?.(channel, err)
        throw err
      }
    })) as typeof ipcMain.handle
  ipcMain.on = ((channel: string, fn: (e: IpcMainEvent, ...a: unknown[]) => void) =>
    on(channel, (e, ...a) => {
      if (!trustedFrame(e.senderFrame?.url, dev)) return
      fn(e, ...a)
    })) as typeof ipcMain.on
}

/** What the app's own window may ask the system for; everything else is refused without a prompt. */
export const MAIN_PERMISSIONS = new Set(['media', 'clipboard-sanitized-write', 'notifications', 'fullscreen'])
export function lockPermissions(dev: boolean) {
  const s = session.defaultSession
  s.setPermissionRequestHandler((wc, permission, done, details) => done(MAIN_PERMISSIONS.has(permission) && trustedFrame(details.requestingUrl ?? wc.getURL(), dev)))
  s.setPermissionCheckHandler((_wc, permission, origin) => MAIN_PERMISSIONS.has(permission) && (origin === UI_ORIGIN || trustedFrame(origin, dev) || (dev && origin.startsWith('http://localhost:5173'))))
}

/** The fuses the packaged app ships with (read back in a test of the packed app). */
export const FUSES = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  GrantFileProtocolExtraPrivileges: false,
} as const
