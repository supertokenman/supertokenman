// Review comments on Claude's changes, written on lines of the Changes tab, sent back as one message:
// each comment with its file, the line it sits on and what that line says, so Claude finds it without
// re-reading the whole file.

export type ReviewComment = { file: string; op: '+' | '-' | ' '; line: string; text: string }

export function reviewMessage(comments: ReviewComment[], cwd = ''): string {
  const list = comments.filter((c) => c.text.trim())
  if (!list.length) return ''
  const rel = (f: string) => (cwd && f.startsWith(cwd + '/') ? f.slice(cwd.length + 1) : f)
  const byFile = new Map<string, ReviewComment[]>()
  for (const c of list) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c])
  const out = [`Review of your changes: ${list.length === 1 ? 'one comment' : `${list.length} comments`}. Address each, then say briefly what you changed.`]
  for (const [file, cs] of byFile) {
    out.push('', `${rel(file)}:`)
    for (const c of cs) {
      const where = c.op === '+' ? 'added line' : c.op === '-' ? 'removed line' : 'line'
      out.push(`- On the ${where} \`${c.line.trim().slice(0, 160)}\`: ${c.text.trim()}`)
    }
  }
  return out.join('\n')
}
