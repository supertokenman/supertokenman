// Dictate anywhere (macOS). A global shortcut starts a recording in a small hidden-focus window; the
// audio is turned into text by a whisper.cpp binary on this Mac and pasted where the cursor is. The
// only processes started are the engine you installed and osascript; no request leaves the machine.
// Pure rules (shortcut, engine check, paste order, clean-up prompt) are in shared/dictation.ts.
import { BrowserWindow, clipboard, globalShortcut, ipcMain, screen, shell, systemPreferences } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanTranscript, cleanupPrompt, detectEngine, ENGINE_BINARIES, accessibilityRefused, parseCleanup, parseShortcut, pasteSequence, PASTE_SCRIPT, whisperArgs, DEFAULT_DICTATION_SHORTCUT, SHORTCUT_NOTE, type PillState } from '../shared/dictation.js'
import { whichOnPath } from './transcripts.js'

export type DictationPrefs = { on?: boolean; accel?: string; model?: string; cleanup?: boolean }

type Deps = {
  prefs: () => DictationPrefs
  save: (p: DictationPrefs) => void
  /** The accelerator Quick search holds, so the two never clash. */
  quickAccel: () => string
  /** The existing small-model path (local model if set, else Claude); used only when Clean up is on. */
  small: (prompt: string) => Promise<{ text: string }>
  /** Loads the app's page with this hash in a window. */
  load: (win: BrowserWindow, hash: string) => Promise<void>
  preload: string
}

const ACCESS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
const MIC_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'

export function setupDictation(d: Deps) {
  const mac = process.platform === 'darwin'
  let pill: BrowserWindow | null = null
  let pillReady: Promise<void> | null = null
  let phase: 'idle' | 'listening' | 'busy' = 'idle'
  let registered = ''
  let hideTimer: NodeJS.Timeout | null = null

  const accel = () => d.prefs().accel || DEFAULT_DICTATION_SHORTCUT
  const engine = () => {
    const model = d.prefs().model ?? ''
    return detectEngine({ found: Object.fromEntries(ENGINE_BINARIES.map((n) => [n, whichOnPath(n)])), model, modelExists: Boolean(model) && existsSync(model) })
  }
  const accessibility = () => (mac ? systemPreferences.isTrustedAccessibilityClient(false) : false)
  const mic = () => (mac ? systemPreferences.getMediaAccessStatus('microphone') : 'unknown')

  async function status() {
    const p = d.prefs()
    const s = parseShortcut(accel())
    return {
      supported: mac,
      on: Boolean(p.on),
      accel: accel(),
      label: s.ok ? s.value.label : accel(),
      note: SHORTCUT_NOTE,
      active: Boolean(registered),
      model: p.model ?? '',
      cleanup: Boolean(p.cleanup),
      engine: engine(),
      accessibility: mac ? accessibility() : null,
      mic: mic(),
    }
  }

  function ensurePill() {
    if (pill && !pill.isDestroyed()) return pillReady!
    pill = new BrowserWindow({
      width: 232, height: 44, show: false, frame: false, transparent: true, resizable: false, movable: false, hasShadow: false,
      focusable: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#00000000',
      webPreferences: { preload: d.preload, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    })
    pill.setAlwaysOnTop(true, 'screen-saver')
    pill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    pill.on('closed', () => { pill = null; pillReady = null; phase = 'idle' })
    pillReady = d.load(pill, 'dictation-pill')
    return pillReady
  }

  async function show(state: PillState, detail = '', hideAfter = 0) {
    await ensurePill()
    if (!pill || pill.isDestroyed()) return
    if (hideTimer) clearTimeout(hideTimer)
    const at = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    pill.setBounds({ x: Math.round(at.x + at.width / 2 - 116), y: Math.round(at.y + at.height - 96), width: 232, height: 44 })
    pill.webContents.send('dictation:state', { state, detail })
    // never takes focus: the app being typed into keeps it, which is where the paste goes
    pill.showInactive()
    if (hideAfter) hideTimer = setTimeout(() => pill?.hide(), hideAfter)
  }

  const run = (bin: string, args: string[], timeout: number) =>
    new Promise<string>((ok, fail) => execFile(bin, args, { timeout, maxBuffer: 16 << 20 }, (e, out, err) => (e ? fail(new Error(String(err || e.message).trim())) : ok(String(out)))))

  async function toggle() {
    if (phase === 'busy') return
    if (phase === 'listening') {
      phase = 'busy'
      pill?.webContents.send('dictation:stop')
      return
    }
    const e = engine()
    if (e.state !== 'ready') return void (await show('setup', e.message, 4000))
    if (mac && mic() !== 'granted') {
      if (!(await systemPreferences.askForMediaAccess('microphone'))) return void (await show('error', 'Microphone access is off. Allow it in System Settings > Privacy & Security > Microphone.', 5000))
    }
    phase = 'listening'
    await show('listening')
    pill?.webContents.send('dictation:record')
  }

  function register() {
    unregister()
    const p = d.prefs()
    if (!p.on || !mac) return false
    try {
      if (globalShortcut.register(accel(), () => void toggle().catch(() => (phase = 'idle')))) registered = accel()
    } catch {
      registered = ''
    }
    return Boolean(registered)
  }
  function unregister() {
    if (registered) globalShortcut.unregister(registered)
    registered = ''
  }

  async function finish(wav: Uint8Array) {
    const dir = mkdtempSync(join(tmpdir(), 'stm-dictation-'))
    try {
      await show('transcribing')
      const e = engine()
      if (e.state !== 'ready') return void (await show('setup', e.message, 4000))
      const file = join(dir, 'speech.wav')
      writeFileSync(file, wav)
      let text = cleanTranscript(await run(e.bin, whisperArgs(e.model, file), 120_000))
      rmSync(file, { force: true })
      if (!text) return void (await show('error', 'Nothing heard.', 2500))
      if (d.prefs().cleanup) {
        await show('cleaning')
        try {
          text = parseCleanup((await d.small(cleanupPrompt(text))).text, text).text
        } catch {
          // the raw transcript is still good; it is inserted as spoken
        }
      }
      const r = await pasteSequence(text, {
        // every format on the clipboard (text, rich text, images), so the old one comes back whole
        snapshot: () => clipboard.read(),
        writeText: (t) => clipboard.writeText(t),
        readText: () => clipboard.readText(),
        restore: (items) => (items.length ? clipboard.write(items) : clipboard.clear()),
        paste: async () => {
          try {
            await run('osascript', ['-e', PASTE_SCRIPT], 5000)
          } catch (x) {
            const m = x instanceof Error ? x.message : String(x)
            throw new Error(accessibilityRefused(m) ? 'Accessibility permission is off' : m)
          }
        },
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      })
      if (r.inserted) return void (await show('inserted', '', 1400))
      await show('copied', r.error ?? '', 5000)
    } catch (x) {
      await show('error', x instanceof Error ? x.message.slice(0, 120) : 'Failed', 4000)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      phase = 'idle'
    }
  }

  ipcMain.handle('dictation:status', () => status())
  ipcMain.handle('dictation:enable', async (_e, on: boolean) => {
    d.save({ ...d.prefs(), on: Boolean(on) })
    if (on && mac) {
      // the system asks now, once, with the app's name on it
      void systemPreferences.askForMediaAccess('microphone')
      systemPreferences.isTrustedAccessibilityClient(true)
    }
    register()
    return status()
  })
  ipcMain.handle('dictation:shortcut', (_e, input: string) => {
    const r = parseShortcut(input, [d.quickAccel()])
    if (!r.ok) throw new Error(r.error)
    const before = d.prefs()
    d.save({ ...before, accel: r.value.accel })
    if (before.on && !register()) {
      d.save(before)
      register()
      throw new Error('Another app already uses this shortcut. Try another one.')
    }
    return status()
  })
  ipcMain.handle('dictation:model', (_e, path: string) => {
    d.save({ ...d.prefs(), model: String(path ?? '').trim().slice(0, 1024) })
    return status()
  })
  ipcMain.handle('dictation:cleanup', (_e, on: boolean) => {
    d.save({ ...d.prefs(), cleanup: Boolean(on) })
    return status()
  })
  ipcMain.handle('dictation:open', (_e, what: 'accessibility' | 'microphone') => void shell.openExternal(what === 'microphone' ? MIC_URL : ACCESS_URL))
  ipcMain.handle('dictation:audio', (_e, wav: Uint8Array) => {
    if (!(wav instanceof Uint8Array) || wav.byteLength < 44 || wav.byteLength > 20 * 1024 * 1024) {
      phase = 'idle'
      return void show('error', 'Nothing heard.', 2500)
    }
    return finish(wav)
  })
  ipcMain.handle('dictation:mic-failed', (_e, why: string) => {
    phase = 'idle'
    return show('error', String(why ?? 'No microphone.').slice(0, 120), 4000)
  })
  return { register, unregister }
}
