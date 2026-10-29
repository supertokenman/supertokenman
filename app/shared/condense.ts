// Long command output, shortened for Claude and kept whole on disk. A port of token-kit's generic condenser
// (token-kit/lib/condense.mjs): the head, the tail, error lines with context and a few distinct warnings; progress
// bars, colour codes and repeated lines are dropped. Pure; the caller saves the original and puts the footer on.

export type CondenseOpts = { maxLines: number; maxChars: number; head: number; tail: number; context: number; maxBlocks: number }
export type Condensed = { text: string; changed: boolean; inLines: number; outLines: number }

/** Bash results longer than this many characters are condensed. */
export const MIN_CHARS = 10_000
export const DEFAULTS: CondenseOpts = { maxLines: 60, maxChars: 6000, head: 6, tail: 25, context: 2, maxBlocks: 12 }

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]/g
const IMPORTANT = /(?:\b(?:error|errors|erro|fail|failed|failure|falh\w*|exception|traceback|panic|fatal|assert(?:ion)?\w*|unhandled|segmentation fault|cannot find|not found|no such file|denied|refused)\b|✗|✖|❌|\bE\s{3})/i
const WARNING = /\b(?:warn|warning|deprecated|aviso)\b/i
const NOISE = [/^\s*[⠀-⣿⠁-⣿|/\\-]\s*$/, /^\s*\[?[=#>\-. ]{10,}\]?\s*\d{1,3}(?:\.\d+)?\s*%/, /^\s*\d{1,3}(?:\.\d+)?%\s*(?:\||$)/]
const MAX_LINE = 400

/** Strips colours and \r rewrites (progress bars) and trailing blanks; one string per line. */
export function cleanLines(raw: string): string[] {
  return raw
    .replace(ANSI, '')
    .split('\n')
    .map((line) => {
      const parts = line.split('\r').filter((p) => p.trim() !== '')
      return (parts.length ? parts[parts.length - 1]! : '').trimEnd()
    })
}

export function condense(raw: string, opt: CondenseOpts = DEFAULTS): Condensed {
  const rawLines = raw.split('\n')
  if (rawLines.length <= opt.maxLines && raw.length <= opt.maxChars) return { text: raw, changed: false, inLines: rawLines.length, outLines: rawLines.length }

  const lines: string[] = []
  const repeats: number[] = []
  for (const l of cleanLines(raw)) {
    if (!IMPORTANT.test(l) && NOISE.some((r) => r.test(l))) continue
    if (lines.length && lines[lines.length - 1] === l) {
      repeats[lines.length - 1]!++
      continue
    }
    lines.push(l)
    repeats.push(1)
  }
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop()
    repeats.pop()
  }

  const render = (i: number) => {
    const l = lines[i]!.length > MAX_LINE ? `${lines[i]!.slice(0, MAX_LINE)}… [+${lines[i]!.length - MAX_LINE} chars]` : lines[i]!
    return repeats[i]! > 1 ? `${l}  [repeated ${repeats[i]}x]` : l
  }
  const filteredChars = lines.reduce((n, l) => n + Math.min(l.length, MAX_LINE) + 1, 0)
  if (lines.length <= opt.maxLines && filteredChars <= opt.maxChars) return { text: lines.map((_, i) => render(i)).join('\n'), changed: true, inLines: rawLines.length, outLines: lines.length }

  const n = lines.length
  const pick = new Uint8Array(n)
  for (let i = 0; i < Math.min(opt.head, n); i++) pick[i] = 1
  for (let i = Math.max(0, n - opt.tail); i < n; i++) pick[i] = 1

  const blocks: [number, number][] = []
  const seen = new Set<string>()
  let warningsSkipped = 0
  for (let i = 0; i < n; i++) {
    const l = lines[i]!
    if (IMPORTANT.test(l)) {
      const from = Math.max(0, i - opt.context)
      const to = Math.min(n - 1, i + opt.context)
      const last = blocks[blocks.length - 1]
      if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to)
      else blocks.push([from, to])
    } else if (WARNING.test(l)) {
      const key = l.replace(/\d+/g, '#').slice(0, 120)
      if (seen.size < 3 && !seen.has(key)) {
        seen.add(key)
        pick[i] = 1
      } else if (!pick[i]) warningsSkipped++
    }
  }
  const kept = blocks.length > opt.maxBlocks ? [...blocks.slice(0, opt.maxBlocks - 1), blocks[blocks.length - 1]!] : blocks
  const blocksSkipped = blocks.length - kept.length
  for (const [a, b] of kept) for (let i = a; i <= b; i++) pick[i] = 1

  const out: string[] = []
  let gap = 0
  let chars = 0
  let cutBySize = 0
  for (let i = 0; i < n; i++) {
    if (!pick[i]) {
      gap++
      continue
    }
    if (gap) out.push(`… [${gap} line${gap > 1 ? 's' : ''} omitted] …`)
    gap = 0
    const r = render(i)
    // the end of the output (the summary) matters most, so only lines before it are cut for size
    if (chars + r.length > opt.maxChars * 2 && i < n - opt.tail) {
      cutBySize++
      continue
    }
    chars += r.length + 1
    out.push(r)
  }
  if (gap) out.push(`… [${gap} line${gap > 1 ? 's' : ''} omitted] …`)
  const notes: string[] = []
  if (blocksSkipped) notes.push(`${blocksSkipped} error block(s) omitted`)
  if (warningsSkipped) notes.push(`${warningsSkipped} repeated warning(s) omitted`)
  if (cutBySize) notes.push(`${cutBySize} line(s) cut by the size limit`)
  if (notes.length) out.push(`… [${notes.join('; ')}] …`)
  return { text: out.join('\n'), changed: true, inLines: rawLines.length, outLines: out.length }
}

/** Commands whose output is the point (diffs, file contents) or that are asked for raw: never condensed. */
export function skipCommand(command: string): boolean {
  if (/#\s*raw\b/.test(command)) return true
  const head = command.replace(/^\s*(?:set -o pipefail;\s*)?(?:cd\s+\S+\s*&&\s*)*/, '').trim()
  return /^(git\s+(diff|show|blame|format-patch)|git\s+log\s+.*-p)\b/.test(head) || /^(cat|head|tail|sed|awk|nl|less|more|bat|jq|yq|diff|xxd|od|base64)\b/.test(head)
}

/** What Claude gets in place of the output: the condensed text and where the whole of it is. */
export function condensedResult(raw: string, file: string, opt: CondenseOpts = DEFAULTS): { text: string; inLines: number; outLines: number } | null {
  const c = condense(raw, opt)
  if (!c.changed) return null
  return { text: `${c.text}\n[condensed ${c.inLines} -> ${c.outLines} lines. Full output: ${file}]`, inLines: c.inLines, outLines: c.outLines }
}
