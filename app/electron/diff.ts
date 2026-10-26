// File edits as line diffs: what an Edit, MultiEdit or Write call is about to change.

export type DiffLine = { op: ' ' | '+' | '-'; text: string }
export type FileEdit = { id: string; tool: string; file: string; lines: DiffLine[]; added: number; removed: number; isNew: boolean }

const MAX_LINES = 4000

/** Line diff by longest common subsequence; past MAX_LINES a side, everything old out and everything new in. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  if (a.length > MAX_LINES || b.length > MAX_LINES) return [...a.map((text) => ({ op: '-' as const, text })), ...b.map((text) => ({ op: '+' as const, text }))]
  const n = a.length
  const m = b.length
  // lcs[i][j] = common lines of a[i..] and b[j..]
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: ' ', text: a[i]! })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ op: '-', text: a[i++]! })
    else out.push({ op: '+', text: b[j++]! })
  }
  while (i < n) out.push({ op: '-', text: a[i++]! })
  while (j < m) out.push({ op: '+', text: b[j++]! })
  return out
}

/** Keeps `ctx` unchanged lines around each change and folds the rest into one marker line. */
export function compact(lines: DiffLine[], ctx = 3): DiffLine[] {
  const keep = lines.map((l) => l.op !== ' ')
  const near = lines.map((_, i) => keep.slice(Math.max(0, i - ctx), i + ctx + 1).some(Boolean))
  const out: DiffLine[] = []
  let skipped = 0
  lines.forEach((l, i) => {
    if (near[i]) {
      if (skipped) out.push({ op: ' ', text: `... ${skipped} unchanged line${skipped === 1 ? '' : 's'}` })
      skipped = 0
      out.push(l)
    } else skipped++
  })
  if (skipped) out.push({ op: ' ', text: `... ${skipped} unchanged line${skipped === 1 ? '' : 's'}` })
  return out
}

/**
 * The edit a tool call makes, or null for any other tool. `read` returns a file's current text,
 * or null when it does not exist (a Write that creates it).
 */
export function editOf(id: string, tool: string, input: Record<string, unknown>, read: (path: string) => string | null): FileEdit | null {
  const file = String(input.file_path ?? '')
  if (!file) return null
  let lines: DiffLine[]
  let isNew = false
  if (tool === 'Edit') lines = lineDiff(String(input.old_string ?? ''), String(input.new_string ?? ''))
  else if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    lines = []
    for (const e of input.edits as { old_string?: string; new_string?: string }[]) {
      if (lines.length) lines.push({ op: ' ', text: '...' })
      lines.push(...lineDiff(String(e.old_string ?? ''), String(e.new_string ?? '')))
    }
  } else if (tool === 'Write') {
    const before = read(file)
    isNew = before === null
    lines = compact(lineDiff(before ?? '', String(input.content ?? '')))
  } else return null
  return { id, tool, file, lines, added: lines.filter((l) => l.op === '+').length, removed: lines.filter((l) => l.op === '-').length, isNew }
}
