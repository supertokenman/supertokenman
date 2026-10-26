// Diagrams in a project: .drawio files under diagrams/, written by the model from a description, a
// selection or an image, and kept as plain draw.io so they open in draw.io itself. Every change the
// model makes keeps the version it replaced, so it can be compared and restored.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { check, createPrompt, editPrompt, extractModel, fileOf, imagePrompt, mergeSelection, modelOf, selection } from '../shared/drawio.js'

export type DiagramVersion = { at: number; model: string; note: string }
export type Ask = (prompt: string, image?: { data: string; mediaType: string }) => Promise<string>

const inflate = (b64: string) => inflateRawSync(Buffer.from(b64, 'base64')).toString('utf8')

export const diagramsDir = (cwd: string) => join(cwd, 'diagrams')

/** The .drawio files under the project's diagrams folder, newest first. */
export function listDiagrams(cwd: string): { path: string; name: string; at: number }[] {
  const dir = diagramsDir(cwd)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.drawio'))
    .map((f) => ({ path: join(dir, f), name: basename(f, '.drawio'), at: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
}

/** A file name from what the person typed: letters, numbers and dashes, inside diagrams/. */
export function diagramPath(cwd: string, name: string): string {
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'diagram'
  return join(diagramsDir(cwd), `${slug}.drawio`)
}

/** Only files inside a project's diagrams folder are read or written here. */
export function insideDiagrams(path: string): boolean {
  const p = resolve(path)
  return p.endsWith('.drawio') && basename(dirname(p)) === 'diagrams' && !relative(dirname(p), p).startsWith('..')
}

export function readModel(path: string): string {
  if (!insideDiagrams(path) || !existsSync(path)) throw new Error('No such diagram.')
  const m = modelOf(readFileSync(path, 'utf8'), inflate)
  if (!m) throw new Error('This .drawio file has no page the app can read (several pages or an unknown format).')
  return m
}

export class DiagramStore {
  constructor(readonly versionsDir: string) {
    mkdirSync(versionsDir, { recursive: true })
  }
  private file = (path: string) => join(this.versionsDir, `${createHash('sha1').update(resolve(path)).digest('hex').slice(0, 16)}.json`)
  versions(path: string): DiagramVersion[] {
    try {
      return JSON.parse(readFileSync(this.file(path), 'utf8')) as DiagramVersion[]
    } catch {
      return []
    }
  }
  /** Writes the model; the one it replaces becomes a version, newest first, at most 30. */
  write(path: string, model: string, note: string, now = Date.now()) {
    if (!insideDiagrams(path)) throw new Error('Diagrams are kept in the project’s diagrams folder.')
    const c = check(model)
    if (!c.ok) throw new Error(`The diagram would not open in draw.io: ${c.problems.join(' ')}`)
    let prev: string | null = null
    try {
      prev = readModel(path)
    } catch {
      prev = null
    }
    if (prev === model) return
    mkdirSync(dirname(path), { recursive: true })
    if (prev) writeFileSync(this.file(path), JSON.stringify([{ at: now, model: prev, note }, ...this.versions(path)].slice(0, 30)))
    writeFileSync(path, fileOf(model, basename(path, '.drawio')))
  }
  restore(path: string, at: number) {
    const v = this.versions(path).find((x) => x.at === at)
    if (!v) throw new Error('That version is gone.')
    this.write(path, v.model, `restored the version of ${new Date(at).toLocaleString()}`)
  }
}

/** The model's answer as a diagram; one more try with the problems named when it would not open. */
export async function draw(ask: Ask, prompt: string, image?: { data: string; mediaType: string }): Promise<string> {
  let answer = await ask(prompt, image)
  let model = extractModel(answer)
  let c = model ? check(model) : { ok: false, problems: ['No <mxGraphModel> in the answer.'] }
  if (!c.ok) {
    answer = await ask(`${prompt}\n\nYour last answer would not open in draw.io: ${c.problems.join(' ')} Answer again with a complete, valid model.`, image)
    model = extractModel(answer)
    c = model ? check(model) : { ok: false, problems: ['No <mxGraphModel> in the answer.'] }
  }
  if (!model || !c.ok) throw new Error(`The model did not give a diagram draw.io can open: ${c.problems.join(' ')}`)
  return model
}

export const create = (ask: Ask, text: string) => draw(ask, createPrompt(text))
export const fromImage = (ask: Ask, image: { data: string; mediaType: string }, hint = '') => draw(ask, imagePrompt(hint), image)

/** A change to the whole diagram, or to the selected shapes only (only they go to the model). */
export async function edit(ask: Ask, model: string, text: string, ids: string[]): Promise<string> {
  if (!ids.length) return draw(ask, editPrompt(text, { model, around: '' }, true))
  const part = selection(model, ids)
  const answer = await draw(ask, editPrompt(text, part, false))
  return mergeSelection(model, ids, answer)
}
