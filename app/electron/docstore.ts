// Documents in: files dropped in a watched folder are read (text, Office and PDF through docs.ts,
// scans and photos through Tesseract OCR), filed under a path from a template, tagged by rules and by
// the local model's suggestions, cut into chunks you can edit, and searched by words and meaning. Every
// file goes through a queue that keeps failures with their error. All of it stays on this machine.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { dateOf, factPrompt, fuse, matchRules, parseFacts, parseScores, parseTags, pathFrom, rerankPrompt, senderOf, tagPrompt, type Rule } from '../shared/docrules.js'
import { bm25, passagesOf } from '../shared/research.js'
import { redact } from '../shared/secrets.js'
import { cosine } from './vecindex.js'

// loaded through require: the test runner's bundler does not know node:sqlite yet
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

export const TEXT_TYPES = ['.txt', '.md', '.csv', '.json', '.eml']
export const IMAGE_TYPES = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp']
export const OFFICE_TYPES = ['.pdf', '.docx', '.pptx', '.xlsx', '.html', '.epub']
export const ACCEPTED = [...TEXT_TYPES, ...IMAGE_TYPES, ...OFFICE_TYPES]

export type Doc = { id: number; hash: string; title: string; path: string; original: string; sender: string; date: string; tags: string[]; suggested: string[]; at: number; chars: number; ocr: boolean }
export type Chunk = { id: number; doc: number; ord: number; text: string; edited: boolean; embedded?: boolean }
export type Job = { id: number; file: string; status: 'waiting' | 'working' | 'done' | 'failed' | 'duplicate'; error: string; doc: number | null; at: number; tries: number }
export type Fact = { id: number; doc: number; text: string; status: 'suggested' | 'confirmed' | 'rejected' }
export type Hit = { chunk: Chunk; doc: Doc; score: number; via: ('words' | 'meaning' | 'rerank')[] }
export type SearchStage = { stage: 'words' | 'meaning' | 'rerank' | 'done'; note: string }

export type Deps = {
  /** the local model for tags, facts and the rerank; null when none is picked */
  ask: ((prompt: string) => Promise<string>) | null
  /** the embedding model; null when none is picked */
  embed: ((texts: string[]) => Promise<number[][]>) | null
  /** Office and PDF files to Markdown (docs.ts) */
  toMarkdown: (path: string) => Promise<string | null>
  ocr?: (path: string) => Promise<string>
}

const run = (cmd: string, args: string[], timeout = 180_000) =>
  new Promise<string>((ok, fail) => execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (e, out, err) => (e ? fail(new Error(String(err || e.message).trim().split('\n').pop())) : ok(out))))
const which = (name: string) => [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`].find((p) => existsSync(p)) ?? null

/** Tesseract on an image, or on each page of a scanned PDF (pdftoppm at 200 dpi), Portuguese and English. */
export async function tesseract(path: string): Promise<string> {
  const t = which('tesseract')
  if (!t) throw new Error('This file needs OCR: install Tesseract (brew install tesseract tesseract-lang).')
  const langs = (await run(t, ['--list-langs']).catch(() => '')).includes('por') ? 'por+eng' : 'eng'
  if (extname(path).toLowerCase() !== '.pdf') return run(t, [path, 'stdout', '-l', langs])
  const p = which('pdftoppm')
  if (!p) throw new Error('A scanned PDF needs pdftoppm (brew install poppler) for OCR.')
  const dir = join(tmpdir(), `stm-ocr-${process.pid}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  try {
    await run(p, ['-r', '200', '-png', '-l', '30', path, join(dir, 'p')]).catch((e: Error) => {
      throw new Error(`The PDF is damaged or not really a PDF (${e.message.replace(/^Syntax Error:\s*/, '')}).`)
    })
    const pages = (await import('node:fs')).readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
    const out: string[] = []
    for (const f of pages) out.push(await run(t, [join(dir, f), 'stdout', '-l', langs]))
    return out.join('\n\f\n')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export class DocStore {
  db: InstanceType<typeof DatabaseSync>
  constructor(
    readonly root: string,
    readonly deps: Deps,
  ) {
    mkdirSync(join(root, 'files'), { recursive: true })
    this.db = new DatabaseSync(join(root, 'docs.db'))
    this.db.exec(`
      create table if not exists docs (id integer primary key, hash text unique, title text, path text, original text, sender text, date text, tags text, suggested text, at integer, chars integer, ocr integer);
      create table if not exists chunks (id integer primary key, doc integer, ord integer, text text, edited integer default 0, vec text);
      create table if not exists queue (id integer primary key, file text, status text, error text default '', doc integer, at integer, tries integer default 0);
      create table if not exists facts (id integer primary key, doc integer, text text, status text);
      create table if not exists rules (id text primary key, json text);
      create table if not exists config (k text primary key, v text);
      create table if not exists compiled (id integer primary key, doc integer, version integer, text text, at integer, how text);
    `)
  }

  config(k: string, v?: string): string {
    if (v !== undefined) this.db.prepare('insert into config(k, v) values (?, ?) on conflict(k) do update set v = excluded.v').run(k, v)
    return (this.db.prepare('select v from config where k = ?').get(k) as { v?: string } | undefined)?.v ?? ''
  }
  get template() {
    return this.config('template') || '{sender}/{year}/{title}'
  }

  rules(): Rule[] {
    return (this.db.prepare('select json from rules').all() as { json: string }[]).map((r) => JSON.parse(r.json) as Rule)
  }
  saveRule(r: Rule) {
    this.db.prepare('insert into rules(id, json) values (?, ?) on conflict(id) do update set json = excluded.json').run(r.id, JSON.stringify(r))
  }
  dropRule(id: string) {
    this.db.prepare('delete from rules where id = ?').run(id)
  }

  private doc = (r: Record<string, unknown>): Doc => ({ ...(r as unknown as Doc), tags: JSON.parse(String(r.tags || '[]')) as string[], suggested: JSON.parse(String(r.suggested || '[]')) as string[], ocr: Boolean(r.ocr) })
  docs(): Doc[] {
    return (this.db.prepare('select * from docs order by at desc').all() as Record<string, unknown>[]).map(this.doc)
  }
  getDoc(id: number): Doc | undefined {
    const r = this.db.prepare('select * from docs where id = ?').get(id) as Record<string, unknown> | undefined
    return r && this.doc(r)
  }
  chunks(doc: number): Chunk[] {
    return (this.db.prepare('select id, doc, ord, text, edited, vec is not null as embedded from chunks where doc = ? order by ord').all(doc) as Record<string, unknown>[]).map((c) => ({ ...(c as unknown as Chunk), edited: Boolean(c.edited), embedded: Boolean(c.embedded) }))
  }
  queue(): Job[] {
    return this.db.prepare('select * from queue order by at desc limit 200').all() as unknown as Job[]
  }
  facts(doc?: number): Fact[] {
    return (doc === undefined ? this.db.prepare("select * from facts where status = 'suggested'").all() : this.db.prepare('select * from facts where doc = ?').all(doc)) as unknown as Fact[]
  }
  allTags(): string[] {
    return [...new Set(this.docs().flatMap((d) => d.tags))].sort()
  }

  /** A file into the queue, unless it is already waiting. */
  enqueue(file: string): number {
    const had = this.db.prepare("select id from queue where file = ? and status in ('waiting', 'working')").get(file) as { id: number } | undefined
    if (had) return had.id
    return Number(this.db.prepare("insert into queue(file, status, at) values (?, 'waiting', ?)").run(file, Date.now()).lastInsertRowid)
  }
  retry(id: number) {
    this.db.prepare("update queue set status = 'waiting', error = '' where id = ? and status = 'failed'").run(id)
  }

  /** Every waiting file, one at a time; a failure stays in the queue with its error. */
  async work(onChange: () => void = () => undefined): Promise<void> {
    for (;;) {
      const j = this.db.prepare("select * from queue where status = 'waiting' order by at limit 1").get() as Job | undefined
      if (!j) return
      this.db.prepare("update queue set status = 'working', tries = tries + 1 where id = ?").run(j.id)
      onChange()
      try {
        const r = await this.ingest(j.file)
        this.db.prepare('update queue set status = ?, doc = ?, error = ? where id = ?').run(r.duplicate ? 'duplicate' : 'done', r.doc, r.duplicate ? `Same content as "${this.getDoc(r.doc)?.title}"` : '', j.id)
      } catch (e) {
        this.db.prepare("update queue set status = 'failed', error = ? where id = ?").run((e as Error).message.slice(0, 400), j.id)
      }
      onChange()
    }
  }

  /** The text of a file: plain, converted, or read by OCR when there is no text layer. */
  async textOf(file: string): Promise<{ text: string; ocr: boolean }> {
    const ext = extname(file).toLowerCase()
    if (!ACCEPTED.includes(ext)) throw new Error(`${ext || 'This file type'} is not a document type the inbox reads.`)
    const ocr = this.deps.ocr ?? tesseract
    if (TEXT_TYPES.includes(ext)) return { text: readFileSync(file, 'utf8'), ocr: false }
    if (IMAGE_TYPES.includes(ext)) return { text: await ocr(file), ocr: true }
    const md = (await this.deps.toMarkdown(file)) ?? ''
    // a PDF with no text layer is a scan: almost nothing beside the title line came out
    if (ext === '.pdf' && md.replace(/^# .*$/m, '').replace(/\s+/g, '').length < 40) return { text: await ocr(file), ocr: true }
    if (!md.trim()) throw new Error('The file has no text that could be read.')
    return { text: md, ocr: false }
  }

  async ingest(file: string): Promise<{ doc: number; duplicate: boolean }> {
    if (!existsSync(file)) throw new Error('The file is gone.')
    if (statSync(file).size > 50 * 1024 * 1024) throw new Error('Over 50 MB; the inbox takes smaller files.')
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex')
    const same = this.db.prepare('select id from docs where hash = ?').get(hash) as { id: number } | undefined
    if (same) return { doc: same.id, duplicate: true }
    const read = await this.textOf(file)
    const ocr = read.ocr
    // credentials in a document are masked before anything is indexed, tagged or sent to a model
    const { text, found } = redact(read.text)
    if (text.replace(/\s+/g, '').length < 3) throw new Error(ocr ? 'OCR found no text in it.' : 'The file has no text.')
    const ext = extname(file).toLowerCase()
    const title = basename(file, extname(file)).replace(/[_]+/g, ' ').trim()
    const matched = matchRules(text, title, this.rules())
    const tags = [...new Set([...matched.flatMap((r) => r.tags), ...(found.length ? ['had-secrets'] : [])])]
    let suggested: string[] = []
    if (this.deps.ask) suggested = parseTags(await this.deps.ask(tagPrompt(title, text, this.allTags())).catch(() => '')).filter((t) => !tags.includes(t))
    const meta = { title, sender: senderOf(text), date: dateOf(text), tags, ext }
    const rel = pathFrom(matched.find((r) => r.template)?.template ?? this.template, meta)
    let dest = join(this.root, 'files', rel)
    for (let n = 2; existsSync(dest); n++) dest = join(this.root, 'files', rel.replace(/(\.[^.]+)?$/, ` ${n}$1`))
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(file, dest)
    const id = Number(
      this.db.prepare('insert into docs(hash, title, path, original, sender, date, tags, suggested, at, chars, ocr) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(hash, title, dest, file, meta.sender ?? '', meta.date ?? '', JSON.stringify(tags), JSON.stringify(suggested), Date.now(), text.length, ocr ? 1 : 0).lastInsertRowid,
    )
    const add = this.db.prepare('insert into chunks(doc, ord, text) values (?, ?, ?)')
    passagesOf(text).forEach((c, i) => add.run(id, i, c))
    await this.embedDoc(id)
    if (this.deps.ask) {
      const facts = parseFacts(await this.deps.ask(factPrompt(title, text)).catch(() => ''))
      const f = this.db.prepare("insert into facts(doc, text, status) values (?, ?, 'suggested')")
      for (const x of facts) f.run(id, x)
    }
    return { doc: id, duplicate: false }
  }

  /** Vectors for the chunks that have none (new or edited), when an embedding model is set. */
  async embedDoc(doc: number) {
    if (!this.deps.embed) return
    const need = this.db.prepare('select id, text from chunks where doc = ? and vec is null').all(doc) as { id: number; text: string }[]
    for (let i = 0; i < need.length; i += 16) {
      const part = need.slice(i, i + 16)
      const v = await this.deps.embed(part.map((c) => c.text)).catch(() => null)
      if (!v) return
      part.forEach((c, k) => this.db.prepare('update chunks set vec = ? where id = ?').run(JSON.stringify(v[k]), c.id))
    }
  }

  setTags(doc: number, tags: string[]) {
    const d = this.getDoc(doc)
    if (!d) return
    this.db.prepare('update docs set tags = ?, suggested = ? where id = ?').run(JSON.stringify([...new Set(tags)]), JSON.stringify(d.suggested.filter((t) => !tags.includes(t))), doc)
  }
  rejectSuggestion(doc: number, tag: string) {
    const d = this.getDoc(doc)
    if (d) this.db.prepare('update docs set suggested = ? where id = ?').run(JSON.stringify(d.suggested.filter((t) => t !== tag)), doc)
  }

  /** A chunk changed, deleted or added by hand; its vector is redone. */
  async editChunk(id: number, text: string) {
    const c = this.db.prepare('select doc from chunks where id = ?').get(id) as { doc: number } | undefined
    if (!c) return
    if (!text.trim()) this.db.prepare('delete from chunks where id = ?').run(id)
    else this.db.prepare('update chunks set text = ?, edited = 1, vec = null where id = ?').run(text.trim(), id)
    await this.embedDoc(c.doc)
  }
  async addChunk(doc: number, text: string) {
    const ord = ((this.db.prepare('select max(ord) as m from chunks where doc = ?').get(doc) as { m: number | null }).m ?? -1) + 1
    this.db.prepare('insert into chunks(doc, ord, text, edited) values (?, ?, ?, 1)').run(doc, ord, text.trim())
    await this.embedDoc(doc)
  }

  /** Phase 86: a chunk joined with the one after it; only the joined chunk is embedded again. */
  async mergeChunk(id: number) {
    const c = this.db.prepare('select doc, ord, text from chunks where id = ?').get(id) as { doc: number; ord: number; text: string } | undefined
    if (!c) return
    const next = this.db.prepare('select id, text from chunks where doc = ? and ord > ? order by ord limit 1').get(c.doc, c.ord) as { id: number; text: string } | undefined
    if (!next) return
    this.db.prepare('update chunks set text = ?, edited = 1, vec = null where id = ?').run(`${c.text}\n\n${next.text}`, id)
    this.db.prepare('delete from chunks where id = ?').run(next.id)
    await this.embedDoc(c.doc)
  }
  /** A chunk cut in two at a character position; the two halves are embedded again, nothing else. */
  async splitChunk(id: number, at: number) {
    const c = this.db.prepare('select doc, ord, text from chunks where id = ?').get(id) as { doc: number; ord: number; text: string } | undefined
    if (!c || at <= 0 || at >= c.text.length) return
    const a = c.text.slice(0, at).trim()
    const b = c.text.slice(at).trim()
    if (!a || !b) return
    this.db.prepare('update chunks set ord = ord + 1 where doc = ? and ord > ?').run(c.doc, c.ord)
    this.db.prepare('update chunks set text = ?, edited = 1, vec = null where id = ?').run(a, id)
    this.db.prepare('insert into chunks(doc, ord, text, edited) values (?, ?, ?, 1)').run(c.doc, c.ord + 1, b)
    await this.embedDoc(c.doc)
  }
  /** The compiled outline and summary of a document, newest version first. */
  compiledOf(doc: number): { version: number; text: string; at: number; how: string }[] {
    return this.db.prepare('select version, text, at, how from compiled where doc = ? order by version desc').all(doc) as { version: number; text: string; at: number; how: string }[]
  }
  saveCompiled(doc: number, text: string, how: string): number {
    const v = ((this.db.prepare('select max(version) as m from compiled where doc = ?').get(doc) as { m: number | null }).m ?? 0) + 1
    this.db.prepare('insert into compiled(doc, version, text, at, how) values (?, ?, ?, ?, ?)').run(doc, v, text, Date.now(), how)
    return v
  }

  /** A suggested fact confirmed (it goes to memory, by the caller) or rejected. */
  setFact(id: number, status: 'confirmed' | 'rejected'): Fact | undefined {
    this.db.prepare('update facts set status = ? where id = ?').run(status, id)
    return this.db.prepare('select * from facts where id = ?').get(id) as unknown as Fact | undefined
  }

  removeDoc(id: number) {
    const d = this.getDoc(id)
    if (!d) return
    if (d.path.startsWith(join(this.root, 'files')) && existsSync(d.path)) rmSync(d.path)
    for (const t of ['chunks', 'facts']) this.db.prepare(`delete from ${t} where doc = ?`).run(id)
    this.db.prepare('delete from docs where id = ?').run(id)
  }

  /**
   * Hybrid search: BM25 over the chunks, the meaning index when an embedding model is set, the two
   * fused by rank, then the local model reranks the top ten when one is picked. Each step is reported.
   */
  async search(q: string, onStage: (s: SearchStage) => void = () => undefined, tag?: string): Promise<Hit[]> {
    const rows = this.db.prepare('select c.id, c.doc, c.ord, c.text, c.edited, c.vec from chunks c').all() as (Record<string, unknown> & { id: number; doc: number; text: string; vec: string | null })[]
    const docs = new Map(this.docs().map((d) => [d.id, d]))
    const pool = rows.filter((r) => !tag || docs.get(r.doc)?.tags.includes(tag))
    if (!pool.length || !q.trim()) return []
    const s = bm25(q, pool.map((r) => `${docs.get(r.doc)?.title ?? ''} ${r.text}`))
    const words = pool.map((r, i) => ({ id: r.id, s: s[i]! })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.id).slice(0, 50)
    onStage({ stage: 'words', note: `${words.length} chunks share words with the question` })
    const lists = [words]
    const via = new Map<number, Set<Hit['via'][number]>>()
    words.forEach((id) => via.set(id, new Set(['words'])))
    const withVec = pool.filter((r) => r.vec)
    if (this.deps.embed && withVec.length) {
      const qv = (await this.deps.embed([q]).catch(() => null))?.[0]
      if (qv) {
        const meaning = withVec.map((r) => ({ id: r.id, s: cosine(qv, JSON.parse(r.vec!) as number[]) })).filter((x) => x.s > 0.3).sort((a, b) => b.s - a.s).map((x) => x.id).slice(0, 50)
        meaning.forEach((id) => via.set(id, new Set([...(via.get(id) ?? []), 'meaning'])))
        lists.push(meaning)
        onStage({ stage: 'meaning', note: `${meaning.length} chunks close in meaning` })
      }
    } else onStage({ stage: 'meaning', note: 'No embedding model picked: words only' })
    let ranked = fuse(lists).slice(0, 20)
    const byId = new Map(pool.map((r) => [r.id, r]))
    if (this.deps.ask && ranked.length > 1) {
      const top = ranked.slice(0, 10)
      const scores = parseScores(await this.deps.ask(rerankPrompt(q, top.map((t) => byId.get(t.id)!.text))).catch(() => ''), top.length)
      if (scores) {
        top.forEach((t, i) => {
          t.score = scores[i]! >= 0 ? scores[i]! / 10 + t.score : t.score
          via.set(t.id, new Set([...(via.get(t.id) ?? []), 'rerank']))
        })
        // what the local model scored under 3 of 10 is left out, unless that would leave nothing
        const kept = top.filter((t, i) => scores[i]! < 0 || scores[i]! >= 3)
        ranked = [...(kept.length ? kept : top).sort((a, b) => b.score - a.score), ...ranked.slice(10)]
        onStage({ stage: 'rerank', note: 'The local model reranked the top 10' })
      } else onStage({ stage: 'rerank', note: 'The local model gave no usable scores; kept the fused order' })
    }
    onStage({ stage: 'done', note: `${ranked.length} result${ranked.length === 1 ? '' : 's'}` })
    return ranked.map((r) => {
      const c = byId.get(r.id)!
      return { chunk: { id: c.id, doc: c.doc, ord: Number(c.ord), text: c.text, edited: Boolean(c.edited) }, doc: docs.get(c.doc)!, score: r.score, via: [...(via.get(r.id) ?? [])] }
    })
  }
}
