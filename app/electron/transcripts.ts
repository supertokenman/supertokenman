// Video transcripts as text, for Claude and the social pack. Off until the person turns it on. The app
// itself contacts no host here: it reads a file they give, takes a transcript they paste, or runs tools
// THEY installed (yt-dlp, whisper.cpp, ffmpeg) on this machine. YouTube links are refused (see
// shared/transcript.ts and docs/BRAND.md, 2026-10-28). Cached on disk per video, size-capped.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { cap, parseSubs, parseWhisperJson, pickRoute, toText, youtubeId, type Cue, type Route, type Transcript } from '../shared/transcript.js'

/** The whole cache, in bytes; oldest entries go first past it. */
export const CACHE_MAX = 20 * 1024 * 1024

export type Run = (bin: string, args: string[], opts: { timeout: number }) => Promise<{ stdout: string }>
export type Deps = {
  dir: string
  enabled: () => boolean
  which: (name: string) => string | null
  run: Run
  now?: () => number
  whisperModel?: () => string | null
}
export type Request = { input: string; text?: string; title?: string; timestamps?: boolean; fresh?: boolean }
export type Result = Transcript & { cached: boolean; display: string }

/** Finds a program on PATH by looking at the disk; starts no process. */
export function whichOnPath(name: string, path = process.env.PATH ?? ''): string | null {
  const dirs = [...path.split(delimiter), '/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local', 'bin')]
  for (const d of dirs) {
    if (!d) continue
    const p = join(d, name)
    try {
      if (statSync(p).isFile()) return p
    } catch {
      // not here
    }
  }
  return null
}

const runFile: Run = (bin, args, opts) =>
  new Promise((ok, fail) => execFile(bin, args, { timeout: opts.timeout, maxBuffer: 64 * 1024 * 1024 }, (e, stdout, stderr) => (e ? fail(new Error(String(stderr || e.message).trim().split('\n').pop())) : ok({ stdout: String(stdout) }))))

export const whisperBin = (which: Deps['which']) => which('whisper-cli') ?? which('whisper-cpp')

/** The cache key: the YouTube id when there is one, else a hash of the link, or of the file with its size and date. */
export function keyOf(input: string): string {
  const yt = youtubeId(input)
  if (yt) return `yt-${yt}`
  let salt = ''
  if (!/^https?:\/\//i.test(input)) {
    try {
      const s = statSync(input)
      salt = `${s.size}:${s.mtimeMs}`
    } catch {
      // pasted or missing
    }
  }
  return createHash('sha256').update(`${input}\n${salt}`).digest('hex').slice(0, 24)
}

function readCache(dir: string, id: string): Transcript | null {
  try {
    return JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')) as Transcript
  } catch {
    return null
  }
}

/** Writes one entry, then drops the oldest until the folder fits under max bytes. */
export function writeCache(dir: string, t: Transcript, max = CACHE_MAX) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${t.id}.json`), JSON.stringify(t))
  const files = readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => ({ p: join(dir, n), ...(({ size, mtimeMs }) => ({ size, at: mtimeMs }))(statSync(join(dir, n))) }))
    .sort((a, b) => a.at - b.at)
  let total = files.reduce((a, f) => a + f.size, 0)
  for (const f of files) {
    if (total <= max) break
    if (f.p.endsWith(`${t.id}.json`)) continue
    rmSync(f.p, { force: true })
    total -= f.size
  }
}

async function viaYtDlp(url: string, d: Deps): Promise<Cue[]> {
  const bin = d.which('yt-dlp')!
  const work = mkdtempSync(join(tmpdir(), 'stm-subs-'))
  try {
    // the person's own tool, on their link; captions only, never the video, never browser cookies
    await d.run(bin, ['--skip-download', '--write-subs', '--write-auto-subs', '--sub-format', 'vtt', '--sub-langs', 'en.*,en', '--no-playlist', '-o', join(work, 'subs.%(ext)s'), '--', url], { timeout: 120_000 })
    const f = readdirSync(work).find((n) => n.endsWith('.vtt'))
    if (!f) throw new Error('yt-dlp found no captions for this video.')
    return parseSubs(readFileSync(join(work, f), 'utf8'))
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

async function viaWhisper(file: string, d: Deps): Promise<Cue[]> {
  const bin = whisperBin(d.which)!
  const model = d.whisperModel?.()
  if (!model) throw new Error(`whisper.cpp needs a model: put a ggml-*.bin file in ${join(d.dir, '..', 'whisper')}.`)
  const work = mkdtempSync(join(tmpdir(), 'stm-whisper-'))
  try {
    let audio = file
    if (!/\.wav$/i.test(file)) {
      const ff = d.which('ffmpeg')
      if (!ff) throw new Error('This file needs ffmpeg (installed by you) to become audio for whisper.cpp; or give a .wav.')
      audio = join(work, 'audio.wav')
      await d.run(ff, ['-nostdin', '-loglevel', 'error', '-i', file, '-ar', '16000', '-ac', '1', audio], { timeout: 600_000 })
    }
    await d.run(bin, ['-m', model, '-f', audio, '-oj', '-of', join(work, 'out'), '-np'], { timeout: 1_800_000 })
    return parseWhisperJson(readFileSync(join(work, 'out.json'), 'utf8'))
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** One transcript. Refuses when off, before anything else: no file read, no process, no request. */
export async function getTranscript(req: Request, d: Deps): Promise<Result> {
  if (!d.enabled()) throw new Error('Video transcripts are off. Turn them on in Settings > Appearance.')
  const input = String(req.input ?? '').trim()
  const show = (t: Transcript, cached: boolean): Result => ({ ...t, cached, display: req.timestamps ? toText(t.cues, true) : t.text })
  const now = d.now?.() ?? Date.now()
  if (req.text?.trim()) {
    const cues = /-->/.test(req.text) ? parseSubs(req.text) : [{ start: 0, text: req.text.trim() }]
    const c = cap(toText(cues))
    const t: Transcript = { id: input ? keyOf(input) : createHash('sha256').update(req.text).digest('hex').slice(0, 24), source: input || 'pasted', route: 'paste', text: c.text, cues, truncated: c.truncated, at: now }
    writeCache(d.dir, t)
    return show(t, false)
  }
  const id = keyOf(input)
  if (!req.fresh) {
    const hit = readCache(d.dir, id)
    if (hit) return show(hit, true)
  }
  const pick = pickRoute(input, { ytdlp: Boolean(d.which('yt-dlp')), whisper: Boolean(whisperBin(d.which)) })
  if ('refuse' in pick) throw new Error(pick.refuse)
  if (pick.route !== 'yt-dlp' && !existsSync(input)) throw new Error(`No file at ${input}.`)
  const route: Route = pick.route
  const cues = route === 'subtitle-file' ? parseSubs(readFileSync(input, 'utf8')) : route === 'whisper' ? await viaWhisper(input, d) : await viaYtDlp(input, d)
  if (!cues.length) throw new Error('No words found in it.')
  // the cap applies to cues too, so the cache entry stays small
  const c = cap(toText(cues))
  let kept = 0
  const capped = c.truncated ? cues.filter((q) => (kept += q.text.length + 1) <= c.text.length) : cues
  const t: Transcript = { id, source: input, route, text: c.text, cues: capped, truncated: c.truncated, at: now }
  writeCache(d.dir, t)
  return show(t, false)
}

// --- wiring: its own settings file, so the app's settings type stays untouched ---

type Prefs = { on?: boolean }
function prefsFile(userData: string) {
  return join(userData, 'transcripts-settings.json')
}
export function readPrefs(userData: string): Prefs {
  try {
    return JSON.parse(readFileSync(prefsFile(userData), 'utf8')) as Prefs
  } catch {
    return {}
  }
}

export function depsFor(userData: string): Deps {
  const which = (n: string) => whichOnPath(n)
  return {
    dir: join(userData, 'transcripts'),
    enabled: () => readPrefs(userData).on === true,
    which,
    run: runFile,
    whisperModel: () => {
      const dir = join(userData, 'whisper')
      try {
        const m = readdirSync(dir).find((n) => /^ggml-.*\.bin$/.test(n))
        return m ? join(dir, m) : null
      } catch {
        return null
      }
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ipc = { handle: (ch: string, fn: (e: unknown, ...a: any[]) => unknown) => void }

/** IPC transcript:get / transcript:enabled / transcript:tools, and the `transcript` command for stm. */
export function registerTranscripts(ipcMain: Ipc, cli: Record<string, (a: Record<string, unknown>) => unknown>, userData: string) {
  const d = depsFor(userData)
  ipcMain.handle('transcript:get', (_e, req: Request) => getTranscript(req, d))
  ipcMain.handle('transcript:enabled', (_e, on?: boolean) => {
    if (typeof on === 'boolean') {
      mkdirSync(userData, { recursive: true })
      writeFileSync(prefsFile(userData), JSON.stringify({ ...readPrefs(userData), on }))
    }
    return d.enabled()
  })
  // what is installed; looked up on disk only, and only once the feature is on
  ipcMain.handle('transcript:tools', () => (d.enabled() ? { ytdlp: Boolean(d.which('yt-dlp')), whisper: Boolean(whisperBin(d.which)), ffmpeg: Boolean(d.which('ffmpeg')), model: Boolean(d.whisperModel?.()) } : null))
  cli.transcript = (a) => getTranscript({ input: String(a.input ?? ''), timestamps: a.timestamps === true, fresh: a.fresh === true }, d)
}
