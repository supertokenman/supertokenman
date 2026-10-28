// Panels working together through `stm` (roadmap v1.2, first step). The pure parts live here so they
// can be tested without Electron: who a caller is, how often it may act, the shared notes and the links.
// The idea of handing each agent terminal the CLI path, the socket and its own id through the
// environment comes from a competitor's public behaviour; nothing else was taken (docs/BRAND.md).
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_LIST } from '../shared/models.js'

/** One secret per panel, handed only to that panel's Claude Code process (STM_PANEL_KEY). */
export class PanelKeys {
  private keys = new Map<string, Buffer>()
  issue(sid: string): string {
    const k = randomBytes(24).toString('hex')
    this.keys.set(sid, Buffer.from(k))
    return k
  }
  drop(sid: string) {
    this.keys.delete(sid)
  }
  /** The caller's panel id, once its key matches; an unknown id or another panel's key is refused. */
  verify(sid: unknown, key: unknown): string {
    const id = String(sid ?? '')
    if (!id) throw new Error('Not inside a panel: STM_PANEL_ID is not set.')
    const want = this.keys.get(id)
    if (!want) throw new Error(`Unknown panel "${id}".`)
    const got = Buffer.from(String(key ?? ''))
    if (got.length !== want.length || !timingSafeEqual(got, want)) throw new Error(`Refused: a panel can only act as itself (the key does not match panel "${id}").`)
    return id
  }
}

/** A sliding window per panel: at most `max` actions in `windowMs`. */
export class RateLimit {
  private hits = new Map<string, number[]>()
  constructor(
    private what: string,
    private max: () => number,
    private windowMs: number,
  ) {}
  take(sid: string, now = Date.now()) {
    const recent = (this.hits.get(sid) ?? []).filter((t) => now - t < this.windowMs)
    const max = this.max()
    if (recent.length >= max) {
      const wait = Math.ceil((this.windowMs - (now - recent[0]!)) / 1000)
      this.hits.set(sid, recent)
      throw new Error(`Rate limit: ${this.what} is capped at ${max} per ${this.windowMs >= 3_600_000 ? 'hour' : 'minute'} for each panel. Try again in ${wait}s.`)
    }
    recent.push(now)
    this.hits.set(sid, recent)
  }
}

export const DEFAULT_LIMITS = { sendPerMin: 10, spawnPerHour: 5 }
export const NOTE_MAX = 64 * 1024
/** how much of a linked panel's last reply stm read returns (the end, where the conclusion is) */
export const READ_MAX = 8000
const NOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export const notesDir = (project: string) => join(project, '.supertokenman', 'notes')
function notePath(project: string, name: string) {
  if (!NOTE_NAME.test(name) || name.includes('..')) throw new Error('A note name is letters, digits, dot, dash or underscore (up to 64), starting with a letter or digit.')
  return join(notesDir(project), `${name}.md`)
}
/** Shared notes of one project folder, kept on this machine under <project>/.supertokenman/notes. */
export function noteGet(project: string, name: string): string {
  const f = notePath(project, name)
  return existsSync(f) ? readFileSync(f, 'utf8') : ''
}
export function noteSet(project: string, name: string, text: string, append = false): { size: number } {
  const f = notePath(project, name)
  const before = append && existsSync(f) ? statSync(f).size : 0
  const add = Buffer.byteLength(text, 'utf8')
  if (before + add > NOTE_MAX) throw new Error(`Note "${name}" would be ${before + add} bytes; notes are capped at ${NOTE_MAX} bytes.`)
  mkdirSync(notesDir(project), { recursive: true })
  if (append) appendFileSync(f, text)
  else writeFileSync(f, text)
  return { size: before + add }
}

export const isModel = (id: string) => MODEL_LIST.some((m) => m.id === id.replace(/\[1m\]$/i, ''))
export const modelIds = () => MODEL_LIST.map((m) => m.id)

export type Link = { a: string; b: string; auto?: boolean; at: number }
export const linkKey = (x: string, y: string) => [x, y].sort().join('|')
export const linkOf = (links: Link[], x: string, y: string) => links.find((l) => linkKey(l.a, l.b) === linkKey(x, y))
export function addLink(links: Link[], a: string, b: string, now = Date.now()): Link[] {
  if (a === b) throw new Error('A panel cannot link to itself.')
  return linkOf(links, a, b) ? links : [...links, { a, b, at: now }].slice(-200)
}
export const linksFor = (links: Link[], sid: string) => links.filter((l) => l.a === sid || l.b === sid).map((l) => ({ panel: l.a === sid ? l.b : l.a, auto: Boolean(l.auto) }))

/** What a message from another panel looks like in the receiving composer: always labelled. */
export const labelled = (fromName: string, text: string) => `From panel ${fromName}: ${text}`

/** How a message is delivered: queued in the composer for the person, unless that link's auto is on. */
export const deliveryOf = (link: Link | undefined): 'queued' | 'auto' => (link?.auto === true ? 'auto' : 'queued')
