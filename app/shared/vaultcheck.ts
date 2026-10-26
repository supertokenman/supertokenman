// Phase 98: what a panel wrote into the vault, checked as it is written: the frontmatter parses, every
// [[link]] points at a note that exists, and a .canvas file is valid JSON Canvas 1.0.

export type Problem = { line?: number; text: string }

/** The frontmatter block: first line `---`, closed by `---`, `key: value` lines or `- item` under a key. */
export function checkFrontmatter(md: string): Problem[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  if (lines[0] !== '---') return /^\s*---\s*$/.test(lines.find((l) => l.trim()) ?? '') && lines[0]!.trim() !== '---' ? [{ line: 1, text: 'Frontmatter must start on the first line.' }] : []
  const end = lines.indexOf('---', 1)
  if (end < 0) return [{ line: 1, text: 'Frontmatter is not closed with ---.' }]
  const out: Problem[] = []
  const keys = new Set<string>()
  let listOpen = false
  for (let i = 1; i < end; i++) {
    const l = lines[i]!
    if (!l.trim() || /^\s*#/.test(l)) continue
    if (/^\s+-\s+\S/.test(l) || /^-\s+\S/.test(l)) {
      if (!listOpen) out.push({ line: i + 1, text: 'A list item with no key above it.' })
      continue
    }
    const m = /^([A-Za-z_][\w -]*):(?:\s+(.*))?$/.exec(l)
    if (!m) {
      out.push({ line: i + 1, text: `Not a "key: value" line: ${l.trim().slice(0, 60)}` })
      continue
    }
    const key = m[1]!.trim()
    if (keys.has(key)) out.push({ line: i + 1, text: `The key "${key}" is there twice.` })
    keys.add(key)
    listOpen = !m[2]
    const v = (m[2] ?? '').trim()
    if (/^\[\[.*\]\]$/.test(v)) out.push({ line: i + 1, text: `A link as a value must be quoted: ${key}: "${v}"` })
    if ((key === 'tags' || key === 'aliases') && v && !/^\[.*\]$/.test(v) && /\s/.test(v)) out.push({ line: i + 1, text: `${key} with spaces: use a list (- one) or [one, two].` })
  }
  return out
}

/** Wikilink targets in a note, without headings, blocks, aliases or embeds of non-notes. */
export function wikilinks(md: string): { target: string; line: number }[] {
  const out: { target: string; line: number }[] = []
  const body = md.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '))
  body.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/!?\[\[([^\]|#^]*)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      const t = m[1]!.trim()
      if (!t) continue
      // embeds of files (images, pdf, audio) are not notes
      if (/\.(png|jpe?g|gif|svg|webp|pdf|mp3|ogg|wav|mp4|webm|base|canvas)$/i.test(t)) continue
      out.push({ target: t, line: i + 1 })
    }
  })
  return out
}

/** Links to notes that are not in the vault; names are matched like Obsidian does, case aside. */
export function brokenLinks(md: string, notes: string[]): Problem[] {
  const have = new Set(notes.map((n) => n.replace(/\.md$/i, '').toLowerCase()))
  const base = (p: string) => p.split('/').pop()!
  const names = new Set([...have].map(base))
  return wikilinks(md).filter((l) => !have.has(l.target.toLowerCase()) && !names.has(base(l.target.toLowerCase()))).map((l) => ({ line: l.line, text: `[[${l.target}]] points at no note in the vault.` }))
}

const SIDES = ['top', 'right', 'bottom', 'left']
/** A .canvas file against JSON Canvas 1.0: unique ids, edges that land, the fields each node type needs. */
export function checkCanvas(text: string): Problem[] {
  let doc: { nodes?: Record<string, unknown>[]; edges?: Record<string, unknown>[] }
  try {
    doc = JSON.parse(text)
  } catch (e) {
    return [{ text: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }]
  }
  const out: Problem[] = []
  const ids = new Set<string>()
  const nodes = new Set<string>()
  for (const n of doc.nodes ?? []) {
    const id = String(n.id ?? '')
    if (!id) out.push({ text: 'A node has no id.' })
    else if (ids.has(id)) out.push({ text: `The id ${id} is used twice.` })
    ids.add(id)
    nodes.add(id)
    const type = String(n.type ?? '')
    if (!['text', 'file', 'link', 'group'].includes(type)) out.push({ text: `Node ${id}: unknown type "${type}".` })
    for (const k of ['x', 'y', 'width', 'height']) if (!Number.isInteger(n[k])) out.push({ text: `Node ${id}: ${k} must be a whole number.` })
    const need = { text: 'text', file: 'file', link: 'url' }[type as 'text']
    if (need && typeof n[need] !== 'string') out.push({ text: `Node ${id}: a ${type} node needs "${need}".` })
    if (typeof n.text === 'string' && /\\n/.test(n.text)) out.push({ text: `Node ${id}: the text has a literal \\n; use a real line break.` })
  }
  for (const e of doc.edges ?? []) {
    const id = String(e.id ?? '')
    if (!id) out.push({ text: 'An edge has no id.' })
    else if (ids.has(id)) out.push({ text: `The id ${id} is used twice.` })
    ids.add(id)
    for (const k of ['fromNode', 'toNode']) if (!nodes.has(String(e[k] ?? ''))) out.push({ text: `Edge ${id}: ${k} ${String(e[k] ?? '(none)')} is not a node.` })
    for (const k of ['fromSide', 'toSide']) if (e[k] !== undefined && !SIDES.includes(String(e[k]))) out.push({ text: `Edge ${id}: ${k} must be top, right, bottom or left.` })
    for (const k of ['fromEnd', 'toEnd']) if (e[k] !== undefined && !['none', 'arrow'].includes(String(e[k]))) out.push({ text: `Edge ${id}: ${k} must be none or arrow.` })
  }
  return out
}

/** The app-side note added to the imported Obsidian skill: what the app's own memory views show as plain text. */
export const VAULT_NOTE = `## In SuperTokenMan's vault

The vault is a folder of Markdown files; Obsidian renders all of the syntax above. The app's own memory views read frontmatter, tags and [[wikilinks]], and show callouts, embeds, comments, highlights, math and Mermaid as plain text. The app checks each note a panel writes: the frontmatter must parse and every [[link]] must point at a note that exists, so create the note first or link to one that is there.`

/** An upstream SKILL.md with its reference files appended, links to them pointing below instead. */
export function assembleSkill(body: string, refs: { file: string; text: string }[], extra = ''): string {
  let out = body.replace(/\[([^\]]+)\]\(references\/([^)]+)\)/g, (_m, label: string) => `${label} (below)`)
  for (const r of refs) out += `\n\n---\n\n${r.text.trim().replace(/^# /, '## Reference: ')}`
  return extra ? `${out}\n\n---\n\n${extra}` : out
}
