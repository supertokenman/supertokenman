// Synopses of tabular data: a big CSV, TSV or JSON-lines file reaches Claude as its row count, its
// columns and a few rows instead of all of it. When the file cannot be read as a table, it says so
// rather than guess.

export type Synopsis = { kind: 'csv' | 'tsv' | 'jsonl'; rows: number; columns: string[] | 'unknown'; sample: string[] }

/** One CSV line into fields, with quotes. */
function fields(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === sep) out.push(cur), (cur = '')
    else cur += c
  }
  out.push(cur)
  return out
}

export function synopsis(text: string, ext: string, sample = 5): Synopsis | null {
  const kind = ext === '.csv' ? 'csv' : ext === '.tsv' ? 'tsv' : ext === '.jsonl' || ext === '.ndjson' ? 'jsonl' : null
  if (!kind) return null
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (kind === 'jsonl') {
    let keys: string[] | 'unknown' = 'unknown'
    try {
      const first = JSON.parse(lines[0] ?? '') as unknown
      if (first && typeof first === 'object' && !Array.isArray(first)) keys = Object.keys(first)
    } catch {
      keys = 'unknown'
    }
    return { kind, rows: lines.length, columns: keys, sample: lines.slice(0, sample).map((l) => l.slice(0, 300)) }
  }
  const sep = kind === 'csv' ? ',' : '\t'
  const head = fields(lines[0] ?? '', sep)
  // a table: every sampled row has the header's number of fields
  const consistent = head.length > 1 && lines.slice(1, 50).every((l) => fields(l, sep).length === head.length)
  return { kind, rows: Math.max(0, lines.length - 1), columns: consistent ? head.map((h) => h.trim()) : 'unknown', sample: lines.slice(1, 1 + sample).map((l) => l.slice(0, 300)) }
}

/** What Claude reads instead of the file. */
export function synopsisText(path: string, s: Synopsis): string {
  return [
    `${path} is a ${s.kind.toUpperCase()} file with ${s.rows.toLocaleString('en-US')} rows; the app sent its synopsis instead of the whole file to save context.`,
    `Columns: ${s.columns === 'unknown' ? 'unknown (the rows do not all have the same fields; do not assume a layout)' : s.columns.join(', ')}.`,
    `First rows:\n${s.sample.join('\n')}`,
    'To see more, Read it again with offset and limit, or compute what you need with a command (awk, a short script, sqlite) instead of reading every row.',
  ].join('\n')
}

export const OFFLOAD_RULE = `# Long results go to files

When a step produces long output you will not need word for word (logs, data, lists over about 60 lines, a finished subtask's notes), write it to .stm/scratch/<short-name>.md in the project and keep only the path and a summary of at most 3 lines in your reply. Read the file again only when you need its details.`
