// Re-reads of a file that has not changed since Claude last read it in this conversation: the text is
// still in its context, so the read is turned aside with a one-line note. A second try goes through,
// and compaction (which drops the earlier text) starts the record over.
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/** Below this the note costs about what the file does. */
export const MIN_BYTES = 2048

type Seen = { sig: string; at: number }

export function rereads(cwd: string) {
  const seen = new Map<string, Seen>()
  const forced = new Set<string>()
  // turned aside this turn and not asked for again: what the turn really saved
  const pending = new Map<string, number>()
  const sig = (full: string) => {
    const st = statSync(full)
    if (!st.isFile()) return null
    return { size: st.size, sig: `${st.size}:${st.mtimeMs}:${createHash('sha1').update(readFileSync(full)).digest('hex')}` }
  }
  return {
    /** A Read about to run: the note to answer with instead, or null to let it read. */
    check(input: Record<string, unknown>): { why: string; bytes: number } | null {
      const path = typeof input.file_path === 'string' ? input.file_path : ''
      if (!path) return null
      const full = resolve(cwd, path)
      const key = `${full}#${input.offset ?? ''}:${input.limit ?? ''}`
      let now: ReturnType<typeof sig>
      try {
        now = sig(full)
      } catch {
        return null
      }
      if (!now) return null
      const before = seen.get(key)
      seen.set(key, { sig: now.sig, at: Date.now() })
      if (forced.has(key)) pending.delete(key)
      if (!before || before.sig !== now.sig || now.size < MIN_BYTES || forced.has(key)) return null
      forced.add(key)
      pending.set(key, now.size)
      return { why: `${path} has not changed since you read it earlier in this conversation (same size, time and content), so its text is still in your context above. Use that. If you truly need it again, Read it once more and it will go through.`, bytes: now.size }
    },
    /** At the end of a turn, the bytes of the reads that stayed turned aside. */
    settle(): number {
      const n = [...pending.values()].reduce((a, b) => a + b, 0)
      pending.clear()
      return n
    },
    /** The context was compacted: earlier reads are gone from it. */
    reset() {
      seen.clear()
      forced.clear()
      pending.clear()
    },
  }
}
