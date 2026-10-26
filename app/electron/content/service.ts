// The content service in the main process: the pieces file, the meter fed by tagged panels, the
// local render and the quality checks. Nothing here spends tokens except the panel the person runs.
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { detect, isImage, isVideo, paths, renderCommand, scriptPrompt, voiceReady } from './engines.js'
import { addTurn, cleanPiece, parseLufs, videoChecks, type Check, type Piece } from './pieces.js'

/** `secretEnv` hands a render the keys its voice needs (only ElevenLabs today), straight from the vault. */
export type ContentDeps = { file: string; log: (id: string, line: string) => void; changed: () => void; secretEnv?: (p: Piece) => Record<string, string> }

const run = (cmd: string, args: string[], cwd?: string) =>
  new Promise<{ code: number; out: string; err: string }>((ok) => execFile(cmd, args, { cwd, maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60_000 }, (e, out, err) => ok({ code: e ? ((e as { code?: number }).code ?? 1) : 0, out: String(out), err: String(err) })))

export function contentService(d: ContentDeps) {
  const read = (): Piece[] => {
    try {
      return existsSync(d.file) ? (JSON.parse(readFileSync(d.file, 'utf8')) as Piece[]).map((p) => cleanPiece(p)) : []
    } catch {
      return []
    }
  }
  const write = (list: Piece[]) => {
    mkdirSync(dirname(d.file), { recursive: true })
    writeFileSync(d.file, JSON.stringify(list, null, 2))
    d.changed()
  }
  const get = (id: string) => read().find((p) => p.id === id)
  const update = (id: string, patch: Partial<Piece> | ((p: Piece) => Partial<Piece>)) => {
    const list = read().map((p) => (p.id === id ? cleanPiece({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) }) : p))
    write(list)
    return list.find((p) => p.id === id)!
  }

  // panels working on a piece: their turns go to its meter
  const tags = new Map<string, string>()
  let window5h: number | undefined
  function onEvent(sid: string, e: { kind?: string; windows?: { kind: string; percentUsed: number }[]; inputTokens?: number; outputTokens?: number; cacheRead?: number; cacheWrite?: number; costUsd?: number }) {
    if (e.kind === 'limits') window5h = e.windows?.find((w) => /five|5h|session/i.test(w.kind))?.percentUsed ?? window5h
    const id = tags.get(sid)
    if (!id || e.kind !== 'turn') return
    update(id, (p) => {
      const usage = addTurn(p.usage, { inputTokens: e.inputTokens ?? 0, outputTokens: e.outputTokens ?? 0, cacheRead: e.cacheRead ?? 0, cacheWrite: e.cacheWrite ?? 0, costUsd: e.costUsd ?? 0 }, window5h)
      // the script was written: take its caption and move on
      if (p.stage === 'script' && p.scriptPath && existsSync(p.scriptPath)) {
        let caption = p.caption
        try {
          const j = JSON.parse(readFileSync(p.scriptPath, 'utf8')) as { legenda?: string; caption?: string }
          caption = String(j.legenda ?? j.caption ?? caption)
        } catch {
          // not JSON: keep what there is
        }
        return { usage, stage: 'render', caption }
      }
      return { usage }
    })
  }

  function create(p: Partial<Piece>) {
    const e = detect(String(p.project ?? ''), p.format)
    const piece = cleanPiece({ ...p, engine: e.id })
    if (e.id === 'bzcorrida') piece.scriptPath = join(e.root!, 'bz', 'roteiros', `${piece.id}.json`)
    // Revideo pieces keep their script and output in the app's data, out of the project's repo
    if (e.id === 'revideo') {
      mkdirSync(join(paths.pieces, piece.id), { recursive: true })
      piece.scriptPath = join(paths.pieces, piece.id, `${piece.id}.json`)
    }
    write([piece, ...read()])
    return piece
  }

  /** What to send to the panel for the script, and which piece it meters. */
  function scriptJob(id: string, sid?: string) {
    const p = get(id)
    if (!p) throw new Error('No such piece.')
    if (sid) tags.set(sid, id)
    update(id, { stage: p.engine === 'text' ? 'review' : 'script' })
    return scriptPrompt(p, detect(p.project, p.format))
  }

  async function check(id: string) {
    const p = get(id)!
    const checks: Check[] = []
    let sheet: string | undefined
    const video = p.outputs.find(isVideo)
    if (video) {
      const probe = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', video])
      const loud = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-filter_complex', 'ebur128', '-f', 'null', '-'])
      try {
        checks.push(...videoChecks(JSON.parse(probe.out), parseLufs(loud.err), p.format))
      } catch {
        checks.push({ name: 'Video', ok: false, detail: 'ffprobe could not read the file. Is ffmpeg installed? brew install ffmpeg' })
      }
      // six frames across the video, side by side
      sheet = video.replace(/\.[^.]+$/, '_sheet.jpg')
      const dur = Number((() => { try { return (JSON.parse(probe.out) as { format?: { duration?: string } }).format?.duration } catch { return 0 } })() ?? 0) || 10
      await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-vf', `fps=${(6 / dur).toFixed(4)},scale=240:-1,tile=6x1`, '-frames:v', '1', sheet])
      if (!existsSync(sheet)) sheet = undefined
    }
    for (const img of p.outputs.filter(isImage)) {
      const pr = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', img])
      try {
        const s = (JSON.parse(pr.out) as { streams: { width: number; height: number }[] }).streams[0]!
        const ok = s.width === 1080 && (s.height === 1350 || s.height === 1080)
        checks.push({ name: img.split('/').pop()!, ok, warn: !ok && s.width >= 1000, detail: `${s.width}×${s.height}${ok ? '' : ', 1080×1350 fills the feed'}` })
      } catch {
        // not readable: skip
      }
    }
    if (!p.caption.trim()) checks.push({ name: 'Caption', ok: false, warn: true, detail: 'No caption yet' })
    else checks.push({ name: 'Caption', ok: p.caption.length <= 2200, detail: `${p.caption.length} characters` })
    return update(id, { checks, sheet, stage: 'review' })
  }

  async function render(id: string) {
    const p = get(id)
    if (!p) throw new Error('No such piece.')
    const e = detect(p.project, p.format)
    if (e.id === 'revideo' && !e.ready) throw new Error('Install the video engine first (Content, top right).')
    const job = renderCommand(p, e)
    if (!job) return check(id)
    if (!existsSync(p.scriptPath!)) throw new Error('The script file is not there yet. Write the script first.')
    update(id, { stage: 'render' })
    const files: string[] = []
    let voiceChars: number | undefined
    const code = await new Promise<number>((ok) => {
      const c = spawn(job.cmd, job.args, { cwd: job.cwd, env: { ...process.env, DISABLE_TELEMETRY: 'true', STM_VOICE_DIR: paths.voice, ...(d.secretEnv?.(p) ?? {}) } })
      const line = (b: Buffer) => {
        for (const l of String(b).split('\n').filter(Boolean)) {
          const used = /^STM_USAGE elevenlabs_chars=(\d+)/.exec(l.trim())
          if (used) {
            voiceChars = Number(used[1])
            continue
          }
          d.log(id, l)
          const f = l.trim()
          const abs = f.startsWith('/') ? f : join(job.cwd, f)
          if (existsSync(abs) && (isVideo(abs) || isImage(abs) || abs.endsWith('_legenda.txt'))) files.push(abs)
        }
      }
      c.stdout.on('data', line)
      c.stderr.on('data', line)
      c.on('close', (n) => ok(n ?? 1))
      c.on('error', (err) => (d.log(id, err.message), ok(1)))
    })
    if (code !== 0) throw new Error('The render stopped with an error; see the log.')
    const legenda = files.find((f) => f.endsWith('_legenda.txt'))
    update(id, { outputs: files.filter((f) => !f.endsWith('_legenda.txt')), caption: legenda ? readFileSync(legenda, 'utf8').trim() : p.caption, voiceChars, stage: 'check' })
    return check(id)
  }

  /** Files the window may show: a piece's outputs and sheets only. */
  const allowed = (path: string) => read().some((p) => p.outputs.includes(path) || p.sheet === path)

  return {
    list: (project?: string) => read().filter((p) => !project || p.project === project),
    engine: (project: string) => detect(project),
    voiceReady,
    /** Installs an engine once (Revideo's packages, or the voice's Python and model), with the log streamed to the window. */
    install: (which: 'video' | 'voice' = 'video') =>
      new Promise<void>((ok, bad) => {
        const c = which === 'voice' ? spawn('sh', [join(paths.voice, 'install.sh')], { cwd: paths.voice, env: process.env }) : spawn('npm', ['install', '--no-audit', '--no-fund'], { cwd: paths.revideo, env: process.env })
        const line = (b: Buffer) => String(b).split('\n').filter(Boolean).forEach((l) => d.log('engine', l))
        c.stdout.on('data', line)
        c.stderr.on('data', line)
        c.on('close', (n) => (n === 0 ? ok() : bad(new Error('The install stopped with an error; see the log.'))))
        c.on('error', (e) => bad(e))
      }),
    create,
    update: (id: string, patch: Partial<Piece>) => update(id, patch),
    remove: (id: string) => (write(read().filter((p) => p.id !== id)), read()),
    scriptJob,
    tag: (sid: string, id: string) => tags.set(sid, id),
    render,
    check,
    onEvent,
    allowed,
  }
}

export const outDirOf = (p: Piece) => (p.outputs[0] ? dirname(p.outputs[0]) : join(p.project, 'out'))
