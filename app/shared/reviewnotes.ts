// Learning from reviews: the notes a person sends back with a denial ("use pnpm here") are kept per
// project. stm learn turns the ones that repeat into proposed lines for the project's CLAUDE.local.md;
// nothing is written until the person picks them. No model is asked: the person's own words are the rule.

export type Lesson = { project: string; text: string; tool: string; at: number }

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

export function addLesson(list: Lesson[], l: Lesson): Lesson[] {
  const text = l.text.trim().replace(/\s+/g, ' ').slice(0, 300)
  return text.length < 4 ? list : [...list, { ...l, text }].slice(-500)
}

export type Proposal = { line: string; count: number; tools: string[]; last: number }

/** The project's notes grouped by what they say, most repeated first; `min` repeats to be proposed. */
export function proposals(list: Lesson[], project: string, min = 1): Proposal[] {
  const by = new Map<string, Proposal>()
  for (const l of list.filter((x) => x.project === project)) {
    const k = norm(l.text)
    const p = by.get(k) ?? { line: l.text, count: 0, tools: [], last: 0 }
    by.set(k, { line: l.at >= p.last ? l.text : p.line, count: p.count + 1, tools: [...new Set([...p.tools, l.tool])], last: Math.max(p.last, l.at) })
  }
  return [...by.values()].filter((p) => p.count >= min).sort((a, b) => b.count - a.count || b.last - a.last)
}

/** The block appended to CLAUDE.local.md for the picked lines; lines already in the file are skipped. */
export function block(existing: string, lines: string[], day: string): string {
  const have = new Set(existing.split('\n').map((l) => norm(l.replace(/^\s*-\s*/, ''))))
  const add = lines.filter((l) => !have.has(norm(l)))
  return add.length ? `\n## From review notes (${day})\n\n${add.map((l) => `- ${l}`).join('\n')}\n` : ''
}
