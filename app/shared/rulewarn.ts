// Hints for the rules editor: an `allow` rule written too broadly weakens approval. Pure; the editor shows these next to the line.
import type { Rule } from './policyrules.js'

export type RuleWarning = { line: number; message: string }

const WRITE_TOOLS = new Set(['write', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const insideProject = (r: Rule) => r.when.some((c) => c.field === 'path' && c.op === 'inside' && c.value.text === '$project')

/** Warnings for the allow rules of a parsed file: `allow *`, `allow Bash` without conditions, `allow write` outside $project, `allow network` without conditions. */
export function broadAllows(rules: Rule[]): RuleWarning[] {
  const out: RuleWarning[] = []
  for (const r of rules) {
    if (r.effect !== 'allow') continue
    if (r.tool === '*') out.push({ line: r.line, message: 'Allows every tool without a card. Name the tool or add a path condition.' })
    else if (r.tool === 'Bash' && r.when.length === 0) out.push({ line: r.line, message: 'Allows every shell command without a card. Add a "when cmd matches" condition.' })
    else if (r.tool === 'network' && r.when.length === 0) out.push({ line: r.line, message: 'Allows every network command and fetch without a card. Add a "when host is" condition.' })
    else if (WRITE_TOOLS.has(r.tool) && !insideProject(r)) out.push({ line: r.line, message: 'Allows writes outside the project. Add "when path inside $project".' })
  }
  return out
}
