// A document compiled (phase 86): its outline (headings, numbered sections, or the first line of each
// chunk) with the chunks under each part, and an optional short summary. Kept as a versioned artifact
// that is cheap to put into a prompt instead of the whole text, with pointers back to the chunks.

export type OutlineNode = { title: string; depth: number; chunks: number[] }

const HEADING = /^(#{1,6})\s+(.+?)\s*#*$|^(\d+(?:\.\d+)*)[.)]\s+(.{3,90})$|^([A-Z][A-Z0-9 ,&/-]{3,60})$/

/** The outline of a document from its chunks (in order): each heading owns the chunks until the next. */
export function outlineOf(chunks: { id: number; text: string }[]): OutlineNode[] {
  const out: OutlineNode[] = []
  for (const c of chunks) {
    const heads = c.text.split('\n').map((l) => l.trim()).map((l) => HEADING.exec(l)).filter((m): m is RegExpExecArray => Boolean(m))
    if (heads.length) {
      for (const m of heads) out.push({ title: (m[2] ?? m[4] ?? m[5] ?? '').trim(), depth: m[1] ? m[1].length : m[3] ? m[3].split('.').length : 1, chunks: [] })
      out[out.length - 1]!.chunks.push(c.id)
    } else if (out.length) out[out.length - 1]!.chunks.push(c.id)
    else out.push({ title: c.text.split('\n')[0]!.slice(0, 80), depth: 1, chunks: [c.id] })
  }
  return out
}

export const SUMMARY_PROMPT = (title: string, outline: string, sample: string) =>
  `Summarize this document in at most 6 short lines for someone deciding whether to read it. Use only what is in it; say what it is, what it decides or requires, and any dates or numbers that matter. No preamble.\n\nTitle: ${title}\n\nOutline:\n${outline}\n\nText (start):\n${sample.slice(0, 8000)}`

export function compiledMd(title: string, outline: OutlineNode[], summary: string, version: number): string {
  const lines = outline.map((n) => `${'  '.repeat(Math.max(0, n.depth - 1))}- ${n.title}${n.chunks.length ? ` [chunks ${n.chunks.join(', ')}]` : ''}`)
  return [`# ${title} (compiled, version ${version})`, '', ...(summary.trim() ? ['## Summary', '', summary.trim(), ''] : []), '## Outline', '', ...lines, '', 'Ask for a chunk by its number to read that part in full.'].join('\n')
}
