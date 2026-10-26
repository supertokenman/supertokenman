// Phase 108: secrets from the person's Bitwarden or Vaultwarden through the official `bw` CLI. They log
// in and unlock; the session key lives only in this process. A linked secret is read from `bw` and
// held in memory for a short while, never written to disk, never sent to the window whole.
import { execFile } from 'node:child_process'

export type Run = (args: string[], env?: Record<string, string>) => Promise<{ code: number; out: string; err: string }>
export const runBw = (bin = 'bw'): Run => (args, env) =>
  new Promise((done) => execFile(bin, args, { timeout: 30_000, maxBuffer: 8_000_000, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', BW_NOINTERACTION: 'true', ...(process.env.BITWARDENCLI_APPDATA_DIR ? { BITWARDENCLI_APPDATA_DIR: process.env.BITWARDENCLI_APPDATA_DIR } : {}), ...env } }, (e, out, err) => done({ code: e ? ((e as { code?: number }).code ?? 1) : 0, out: String(out), err: String(err) })))

export type Link = { item: string; field: 'password' | 'username' | 'notes' | `field:${string}`; label: string }
export type Status = { installed: boolean; status: 'unauthenticated' | 'locked' | 'unlocked' | 'missing'; server?: string; user?: string }
type Item = { id: string; name: string; login?: { username?: string; password?: string }; notes?: string; fields?: { name: string; value: string }[] }

export const pick = (it: Item, f: Link['field']): string | undefined =>
  f === 'password' ? it.login?.password : f === 'username' ? it.login?.username : f === 'notes' ? it.notes : it.fields?.find((x) => x.name === f.slice(6))?.value

export class Bitwarden {
  private session: string | null = null
  private cache = new Map<string, { value: string; at: number }>()
  constructor(private run: Run, private ttlMs = 15 * 60_000) {}

  async status(): Promise<Status> {
    const r = await this.run(['status', ...(this.session ? ['--session', this.session] : [])])
    if (r.code === 127 || /ENOENT|not found/i.test(r.err)) return { installed: false, status: 'missing' }
    try {
      const j = JSON.parse(r.out) as { status: Status['status']; serverUrl?: string; userEmail?: string }
      return { installed: true, status: j.status, server: j.serverUrl ?? undefined, user: j.userEmail ?? undefined }
    } catch {
      return { installed: true, status: 'locked' }
    }
  }
  /** The master password goes to bw through its own environment variable, for this one call. */
  async unlock(password: string): Promise<boolean> {
    const r = await this.run(['unlock', '--passwordenv', 'BW_PASSWORD', '--raw'], { BW_PASSWORD: password })
    if (r.code !== 0 || !r.out.trim()) throw new Error(/Invalid master password/i.test(r.err) ? 'Wrong master password.' : r.err.trim().split('\n')[0] || 'bw could not unlock.')
    this.session = r.out.trim()
    return true
  }
  async lock() {
    this.cache.clear()
    if (this.session) await this.run(['lock', '--session', this.session])
    this.session = null
  }
  get unlocked() {
    return Boolean(this.session)
  }
  private need() {
    if (!this.session) throw new Error('Unlock Bitwarden first.')
    return this.session
  }
  /** Names and which fields each has; never the values. */
  async search(q: string): Promise<{ id: string; name: string; fields: Link['field'][] }[]> {
    const r = await this.run(['list', 'items', '--search', String(q).slice(0, 100), '--session', this.need()])
    if (r.code !== 0) throw new Error(r.err.trim() || 'bw list failed.')
    return (JSON.parse(r.out) as Item[]).slice(0, 50).map((it) => ({
      id: it.id,
      name: it.name,
      fields: [...(it.login?.password ? ['password' as const] : []), ...(it.login?.username ? ['username' as const] : []), ...(it.notes ? ['notes' as const] : []), ...(it.fields ?? []).map((f) => `field:${f.name}` as const)],
    }))
  }
  /** The value, read now unless read in the last few minutes. */
  async value(l: Link): Promise<string | undefined> {
    const key = `${l.item}|${l.field}`
    const c = this.cache.get(key)
    if (c && Date.now() - c.at < this.ttlMs) return c.value
    const r = await this.run(['get', 'item', l.item, '--session', this.need()])
    if (r.code !== 0) throw new Error(r.err.trim() || 'bw get failed.')
    const v = pick(JSON.parse(r.out) as Item, l.field)
    if (v !== undefined) this.cache.set(key, { value: v, at: Date.now() })
    return v
  }
  /** What is held in memory right now, for a synchronous read; refreshed by value(). */
  held(l: Link): string | undefined {
    const c = this.cache.get(`${l.item}|${l.field}`)
    return c && Date.now() - c.at < this.ttlMs ? c.value : undefined
  }
}
