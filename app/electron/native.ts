// The Mac feel (phase 79): an application menu with the app's real shortcuts, a right-click menu in the
// window (spelling, cut, copy, paste, links), the window put back where it was, and a dock badge for
// pending approvals. Shortcuts in the menu are shown, not captured: the window keeps handling its keys.
import { app, BrowserWindow, clipboard, ipcMain, Menu, screen, shell, type MenuItemConstructorOptions } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { clampBounds, parseState, type WinState } from '../shared/winstate.js'

/** The menu bar; items that open a screen send its palette id to the window. */
export function menuTemplate(go: (id: string) => void, opts: { mac: boolean; dev: boolean; name: string }): MenuItemConstructorOptions[] {
  const item = (label: string, id: string, accelerator?: string): MenuItemConstructorOptions => ({ label, click: () => go(id), ...(accelerator ? { accelerator, registerAccelerator: false } : {}) })
  return [
    ...(opts.mac
      ? [{ label: opts.name, submenu: [{ role: 'about' }, { type: 'separator' }, item('Settings...', 'go-config', 'CmdOrCtrl+,'), item('Modules...', 'go-modules'), { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] } as MenuItemConstructorOptions]
      : []),
    { label: 'File', submenu: [item('New panel', 'menu:new-panel', 'CmdOrCtrl+T'), item('Open a folder...', 'menu:open-folder', 'CmdOrCtrl+O'), item('New project from template...', 'menu:new-from-template'), { type: 'separator' }, item('Export session...', 'menu:export'), item('Export team...', 'menu:team-export'), item('Import team...', 'menu:team-import'), { type: 'separator' }, opts.mac ? { role: 'close' } : { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        item('Command palette', 'menu:palette', 'CmdOrCtrl+K'),
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(opts.dev ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[] : []),
      ],
    },
    { role: 'windowMenu' },
    { role: 'help', submenu: [item('Tour', 'go-tour'), item('Diagnostics', 'go-diagnostics'), { type: 'separator' }, { label: 'Release notes and source', click: () => void shell.openExternal('https://github.com/arimayuji/CLI') }] },
  ]
}

/**
 * Right click in the app's window: what fits where the click was. Inspect only in development. The rows
 * are drawn by the app (src/ui/ContextMenu.tsx, not the system's menu); the chosen one runs here.
 */
type Row = { label: string; enabled?: boolean; run: () => void } | 'sep'
export function contextRows(win: BrowserWindow, p: Electron.ContextMenuParams, dev: boolean): Row[] {
  const wc = win.webContents
  const t: Row[] = []
  if (p.misspelledWord) {
    for (const s of p.dictionarySuggestions.slice(0, 5)) t.push({ label: s, run: () => wc.replaceMisspelling(s) })
    t.push({ label: 'Add to dictionary', run: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, 'sep')
  }
  if (p.linkURL && /^https?:\/\//.test(p.linkURL)) t.push({ label: 'Open link in browser', run: () => void shell.openExternal(p.linkURL) }, { label: 'Copy link', run: () => clipboard.writeText(p.linkURL) }, 'sep')
  if (p.isEditable) t.push({ label: 'Cut', enabled: p.editFlags.canCut, run: () => wc.cut() }, { label: 'Copy', enabled: p.editFlags.canCopy, run: () => wc.copy() }, { label: 'Paste', enabled: p.editFlags.canPaste, run: () => wc.paste() }, 'sep', { label: 'Select all', run: () => wc.selectAll() })
  else if (p.selectionText.trim()) t.push({ label: 'Copy', run: () => wc.copy() })
  if (dev) t.push('sep', { label: 'Inspect', run: () => wc.inspectElement(p.x, p.y) })
  while (t.length && t[t.length - 1] === 'sep') t.pop()
  return t
}
export function contextMenu(win: BrowserWindow, dev: boolean) {
  let rows: Row[] = []
  win.webContents.on('context-menu', (_e, p) => {
    rows = contextRows(win, p, dev)
    if (rows.length) win.webContents.send('ctx:open', { x: p.x, y: p.y, items: rows.map((r) => (r === 'sep' ? { sep: true } : { label: r.label, enabled: r.enabled !== false })) })
  })
  ipcMain.on('ctx:pick', (e, i: unknown) => {
    if (e.sender !== win.webContents || typeof i !== 'number') return
    const r = rows[i]
    rows = []
    if (r && r !== 'sep' && r.enabled !== false) r.run()
  })
}
/** Bounds to open with, from the saved state, kept on a screen that exists now. */
export function savedBounds(file: string): (WinState & { ok: true }) | null {
  let text: string | null = null
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const s = parseState(text)
  if (!s) return null
  const screens = [screen.getPrimaryDisplay(), ...screen.getAllDisplays().filter((d) => d.id !== screen.getPrimaryDisplay().id)].map((d) => d.workArea)
  return { ...clampBounds(s, screens), maximized: s.maximized, ok: true }
}

/** Saves the window's place a moment after it stops moving, and when it closes. */
export function keepBounds(win: BrowserWindow, file: string) {
  let t: NodeJS.Timeout | null = null
  const save = () => {
    if (win.isDestroyed() || win.isMinimized()) return
    const b = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds()
    try {
      writeFileSync(file, JSON.stringify({ ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen() }))
    } catch {
      // the next move tries again
    }
  }
  const later = () => (t && clearTimeout(t), (t = setTimeout(save, 400)))
  win.on('resize', later)
  win.on('move', later)
  win.on('maximize', save)
  win.on('unmaximize', save)
  win.on('close', save)
}

export const windowStateFile = () => join(app.getPath('userData'), 'window-state.json')

/** The dock (and Unity launcher) shows how many approvals wait. */
export const badge = (n: number) => void app.setBadgeCount(Math.max(0, n))
