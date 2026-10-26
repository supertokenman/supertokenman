// Screenshot to code in the main process: the image goes to Claude with the project's components and
// tokens, the files come back into a job folder, the page is rendered off screen at the image's width,
// compared pixel by pixel, and Claude fixes what differs, round after round under the budget brake.
// Nothing touches the project until you apply a round.

import { BrowserWindow, nativeImage, type NativeImage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pixelDiff } from '../shared/pixeldiff.js'
import { best, entryOf, filesOf, fixPrompt, generatePrompt, prototype, safePath, shouldStop, type CodeFile, type Round, type Target } from '../shared/shot2code.js'
import { inventory } from './inventory.js'

type Deps = {
  dir: () => string
  ask: (prompt: string, project: string, stop: AbortController, image: { data: string; mediaType: string }) => Promise<{ text: string; costUsd: number }>
  budget: (project: string, tokens: number) => string | null
  progress: (jobId: string, round: RoundView | null, note: string) => void
}
export type RoundView = Round & { render?: string; diff?: string }
export type Job = { id: string; at: number; name: string; target: Target; project: string; width: number; height: number; image: string; rounds: RoundView[]; stopped?: string; running: boolean }

const MAX_W = 1440

/** The project's design tokens, briefly: Tailwind theme and :root variables, as text for the prompt. */
function tokensOf(project: string): string {
  const out: string[] = []
  for (const f of ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs']) {
    const p = join(project, f)
    if (existsSync(p)) out.push(readFileSync(p, 'utf8').slice(0, 2500))
  }
  for (const f of ['src/index.css', 'src/app.css', 'src/globals.css', 'app/globals.css', 'styles/globals.css', 'src/styles.css']) {
    const p = join(project, f)
    if (!existsSync(p)) continue
    const root = /:root\s*\{[^}]*\}/.exec(readFileSync(p, 'utf8'))
    if (root) out.push(root[0].slice(0, 2500))
  }
  return out.join('\n\n')
}

const bitmap = (img: NativeImage) => {
  const { width, height } = img.getSize()
  // Electron's bitmap is BGRA: both sides are, so channels still line up for the comparison
  return { width, height, data: new Uint8ClampedArray(img.toBitmap()) }
}

async function render(file: string, width: number, height: number): Promise<NativeImage> {
  const w = new BrowserWindow({ show: false, width, height, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false } })
  try {
    // the page may only load from its own folder and the CDNs it names; nothing navigates away
    w.webContents.on('will-navigate', (e) => e.preventDefault())
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await w.loadFile(file)
    // Tailwind's play script styles the page after load
    await new Promise((r) => setTimeout(r, 1200))
    return await w.webContents.capturePage({ x: 0, y: 0, width, height })
  } finally {
    w.destroy()
  }
}

export function shotToCode(d: Deps) {
  const jobs = new Map<string, Job>()
  const stops = new Map<string, AbortController>()
  const jobDir = (id: string) => join(d.dir(), 'shot2code', id)

  async function compare(job: Job, files: CodeFile[], n: number): Promise<{ percent: number | null; box: ReturnType<typeof pixelDiff>['box']; render?: string; diff?: string }> {
    const dir = join(jobDir(job.id), `round-${n}`)
    for (const f of files) {
      mkdirSync(dirname(join(dir, f.path)), { recursive: true })
      writeFileSync(join(dir, f.path), f.content)
    }
    const entry = entryOf(job.target, files)
    if (!entry) return { percent: null, box: null }
    const shot = (await render(join(dir, entry.path), job.width, job.height)).resize({ width: job.width, height: job.height })
    const src = nativeImage.createFromDataURL(job.image).resize({ width: job.width, height: job.height })
    const diff = pixelDiff(bitmap(src), bitmap(shot))
    // the mask is RGBA; a bitmap wants BGRA
    const m = diff.mask
    for (let i = 0; i < m.length; i += 4) [m[i], m[i + 2]] = [m[i + 2]!, m[i]!]
    const maskImg = nativeImage.createFromBitmap(Buffer.from(m.buffer), { width: Math.max(job.width, shot.getSize().width), height: Math.max(job.height, shot.getSize().height) })
    return { percent: Math.round(diff.percent * 10) / 10, box: diff.box, render: shot.toDataURL(), diff: maskImg.toDataURL() }
  }

  async function run(job: Job, o: { rounds: number; target: number; note?: string }) {
    const stop = new AbortController()
    stops.set(job.id, stop)
    job.running = true
    const image = { data: job.image.split(',')[1]!, mediaType: /^data:([^;]+)/.exec(job.image)?.[1] ?? 'image/png' }
    try {
      for (let n = 1; ; n++) {
        const prev = job.rounds[job.rounds.length - 1]
        const prompt =
          !prev || !prev.files.length
            ? generatePrompt(job.target, job.width, job.height, { tokens: tokensOf(job.project), components: job.target === 'react' ? safeInventory(job.project) : undefined, note: o.note })
            : fixPrompt(job.target, prev.files, prev.percent ?? 100, lastBox.get(job.id) ?? null, job.width, job.height)
        const no = d.budget(job.project, Math.ceil(prompt.length / 3.6) + 1600)
        if (no) {
          job.stopped = no
          break
        }
        d.progress(job.id, null, `Round ${n}: asking Claude…`)
        const a = await d.ask(prompt, job.project, stop, image)
        const files = filesOf(a.text, job.target)
        const round: RoundView = { n, files, percent: null, costUsd: a.costUsd, ...(files.length ? {} : { note: 'The answer had no files.' }) }
        if (files.length) {
          d.progress(job.id, null, `Round ${n}: rendering and comparing…`)
          const c = await compare(job, files, n).catch((e: Error) => ({ percent: null, box: null, error: e.message }))
          Object.assign(round, { percent: c.percent, ...('render' in c ? { render: c.render, diff: c.diff } : {}), ...('error' in c ? { note: c.error } : {}) })
          lastBox.set(job.id, c.box ?? null)
        }
        job.rounds.push(round)
        d.progress(job.id, round, round.percent != null ? `Round ${n}: ${round.percent}% differ.` : `Round ${n}: ${round.note ?? 'not compared'}`)
        const why = shouldStop(job.rounds, { target: o.target, max: o.rounds })
        if (why) {
          job.stopped = why
          break
        }
        if (stop.signal.aborted) {
          job.stopped = 'Stopped.'
          break
        }
      }
    } catch (e) {
      job.stopped = stop.signal.aborted ? 'Stopped.' : (e as Error).message
    } finally {
      job.running = false
      stops.delete(job.id)
      d.progress(job.id, null, job.stopped ?? 'Done.')
    }
  }
  const lastBox = new Map<string, ReturnType<typeof pixelDiff>['box']>()
  const safeInventory = (p: string) => {
    try {
      return inventory(p).components.sort((a, b) => b.uses - a.uses).map((c) => `${c.name} (${c.file})`)
    } catch {
      return []
    }
  }

  return {
    list: () => [...jobs.values()].sort((a, b) => b.at - a.at).map(({ image: _i, ...j }) => ({ ...j, rounds: j.rounds.map(({ render: _r, diff: _d, ...r }) => r) })),
    get: (id: string) => jobs.get(id) ?? null,
    start(o: { name: string; target: Target; project: string; image: string; rounds: number; target_: number; note?: string }) {
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(o.image)) throw new Error('Give a PNG, JPEG or WebP image.')
      const img = nativeImage.createFromDataURL(o.image)
      if (img.isEmpty()) throw new Error('That image could not be read.')
      let { width, height } = img.getSize()
      // a large screenshot is compared at a desktop width, keeping its shape
      if (width > MAX_W) [width, height] = [MAX_W, Math.round((height * MAX_W) / width)]
      const job: Job = { id: `s${Date.now().toString(36)}`, at: Date.now(), name: o.name.trim().slice(0, 60) || 'Screen', target: o.target === 'react' ? 'react' : 'html', project: o.project, width, height, image: width === img.getSize().width ? o.image : img.resize({ width, height }).toDataURL(), rounds: [], running: true }
      jobs.set(job.id, job)
      void run(job, { rounds: Math.max(1, Math.min(6, Math.round(o.rounds))), target: Math.max(0.5, Math.min(50, o.target_)), note: o.note })
      return job.id
    },
    stop: (id: string) => stops.get(id)?.abort(),
    /** Copies a round's files into the project, under a folder you name; never over a file without `overwrite`. */
    apply(id: string, n: number | null, folder: string, overwrite: boolean) {
      const job = jobs.get(id)
      if (!job) throw new Error('No such job.')
      const r = n == null ? best(job.rounds) : job.rounds.find((x) => x.n === n)
      if (!r?.files.length) throw new Error('That round has no files.')
      if (!safePath(folder.replace(/\/+$/, '') + '/x')) throw new Error('Name a folder inside the project, such as src/screens/login.')
      const base = resolve(job.project, folder)
      if (!base.startsWith(resolve(job.project) + '/')) throw new Error('The folder must be inside the project.')
      const clash = r.files.filter((f) => existsSync(join(base, f.path))).map((f) => f.path)
      if (clash.length && !overwrite) return { written: [], clash }
      for (const f of r.files) {
        mkdirSync(dirname(join(base, f.path)), { recursive: true })
        writeFileSync(join(base, f.path), f.content)
      }
      return { written: r.files.map((f) => join(folder, f.path)), clash: [] }
    },
    /** The best HTML round of several jobs as one click-through prototype in the project. */
    prototype(ids: string[], folder: string) {
      const screens = ids.map((id) => jobs.get(id)).filter((j): j is Job => !!j && j.target === 'html').map((j) => ({ name: j.name, html: entryOf('html', best(j.rounds)?.files ?? [])?.content ?? '' })).filter((s) => s.html)
      if (screens.length < 2) throw new Error('Pick at least two HTML screens with a result.')
      const base = resolve(screens.length ? jobs.get(ids[0]!)!.project : '', folder)
      if (!safePath(folder.replace(/\/+$/, '') + '/x') || !base.startsWith(resolve(jobs.get(ids[0]!)!.project) + '/')) throw new Error('Name a folder inside the project.')
      const files = prototype(screens)
      mkdirSync(base, { recursive: true })
      for (const f of files) writeFileSync(join(base, f.path), f.content)
      return join(folder, 'index.html')
    },
  }
}
