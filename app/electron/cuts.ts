// token-kit's cuts, live: follows the kit's monthly stats file and reports each new line that
// names one of the app's sessions. Reads only what was appended since the last look.
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Cut = { session: string; tokens: number; at: number; cmd: string }

export const kitHome = (home = homedir()) => process.env.TOKEN_KIT_HOME || join(process.env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'token-kit')
const monthFile = (dir: string, d = new Date()) => join(dir, `stats-${d.toISOString().slice(0, 7)}.jsonl`)

export class CutWatcher {
  private file = ''
  private offset = 0
  private partial = ''

  constructor(private dir: string, private onCut: (c: Cut) => void) {}

  /** Starts at the end of the current file: cuts from before the app opened are not news. */
  start(now = new Date()) {
    this.file = monthFile(this.dir, now)
    this.offset = existsSync(this.file) ? statSync(this.file).size : 0
  }

  /** Reads what was appended since the last poll; follows the switch to a new month's file. */
  poll(now = new Date()) {
    const current = monthFile(this.dir, now)
    if (current !== this.file) {
      this.file = current
      this.offset = 0
      this.partial = ''
    }
    if (!existsSync(this.file)) return
    const size = statSync(this.file).size
    if (size < this.offset) this.offset = 0
    if (size === this.offset) return
    const fd = openSync(this.file, 'r')
    const buf = Buffer.alloc(size - this.offset)
    readSync(fd, buf, 0, buf.length, this.offset)
    closeSync(fd)
    this.offset = size
    const lines = (this.partial + buf.toString('utf8')).split('\n')
    this.partial = lines.pop() ?? ''
    for (const line of lines) {
      try {
        const e = JSON.parse(line) as { ts: string; kind: string; session?: string; inChars: number; outChars: number; cmd?: string }
        if (!e.session || e.kind === 'read-guard') continue
        this.onCut({ session: e.session, tokens: Math.max(0, e.inChars - e.outChars) / 4, at: Date.parse(e.ts) || Date.now(), cmd: e.cmd ?? '' })
      } catch {
        // not a stats line
      }
    }
  }
}
