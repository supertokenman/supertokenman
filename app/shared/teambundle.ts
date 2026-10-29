// A team of panels as one Markdown file: panels, the links between them and the triggers that start them.
// Export writes the file; import reads it back and only then lists what would be created (reviewLines), so
// nothing is made before the person has seen the summary. Triggers always come in turned off.

export type Team = {
  name: string
  description: string
  panels: { name: string; folder: string; persona?: string; instructions: string }[]
  links: { a: string; b: string; auto: boolean; capUsd?: number }[]
  triggers: { name: string; panel: string; when: string; prompt: string }[]
}

export const MAX_PANELS = 12
export const MAX_INSTRUCTIONS = 8000

const META = ['folder', 'persona', 'auto', 'cap', 'panel', 'when']

/** Markdown for a team; empty optional fields are written as empty values so the file reads as a form. */
// a line of prose that looks like a heading gets a backslash, so it stays prose
const esc = (t: string) => t.replace(/^(\\*)(#{1,2} )/gm, '\\$1$2')
const unesc = (t: string) => t.replace(/^\\(\\*#{1,2} )/gm, '$1')

export function toMarkdown(t: Team): string {
  const out: string[] = [`# Team: ${t.name}`, '', t.description.trim(), '']
  for (const p of t.panels) {
    out.push(`## Panel: ${p.name}`, `- folder: ${p.folder}`, `- persona: ${p.persona ?? ''}`, '', esc(p.instructions.trim()), '')
  }
  for (const l of t.links) {
    out.push(`## Link: ${l.a} <-> ${l.b}`, `- auto: ${l.auto ? 'yes' : 'no'}`, `- cap: ${l.capUsd ?? ''}`, '')
  }
  for (const r of t.triggers) {
    out.push(`## Trigger: ${r.name}`, `- panel: ${r.panel}`, `- when: ${r.when}`, '', esc(r.prompt.trim()), '')
  }
  return out.join('\n')
}

/** Reads a bundle back. Throws an Error whose message is plain English for the person to fix in the file. */
export function parseBundle(md: string): Team {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const head = lines.findIndex((l) => /^# Team:/.test(l))
  if (head < 0) throw new Error('The file has no "# Team:" heading at the top, so it is not a team bundle.')
  const name = lines[head].replace(/^# Team:/, '').trim()
  if (!name) throw new Error('The team needs a name after "# Team:".')

  // Split into sections at "## Kind: name" headings; the lines before the first one are the description.
  const sections: { kind: string; name: string; body: string[] }[] = []
  const pre: string[] = []
  for (const l of lines.slice(head + 1)) {
    const h = /^## (Panel|Link|Trigger):(.*)$/.exec(l)
    if (h) sections.push({ kind: h[1], name: h[2].trim(), body: [] })
    else if (/^## /.test(l)) throw new Error(`Unknown section "${l.slice(3).trim()}". Use Panel, Link or Trigger.`)
    else if (sections.length) sections[sections.length - 1].body.push(l)
    else pre.push(l)
  }

  const panels: Team['panels'] = []
  const links: Team['links'] = []
  const triggers: Team['triggers'] = []
  for (const s of sections) {
    const { meta, prose } = splitBody(s.body)
    if (s.kind === 'Panel') {
      if (!s.name) throw new Error('Every panel needs a name after "## Panel:".')
      const folder = (meta.folder ?? '').trim() || '.'
      if (/^([\\/]|~|[A-Za-z]:)/.test(folder) || folder.split(/[\\/]/).includes('..'))
        throw new Error(`Folders must stay inside the project: ${folder} (panel ${s.name})`)
      const persona = (meta.persona ?? '').trim() || undefined
      panels.push({ name: s.name, folder, ...(persona ? { persona } : {}), instructions: unesc(prose).slice(0, MAX_INSTRUCTIONS) })
    } else if (s.kind === 'Link') {
      const m = /^(.*?)\s*<->\s*(.*)$/.exec(s.name)
      if (!m || !m[1].trim() || !m[2].trim()) throw new Error(`A link needs two panels: "## Link: <panel A> <-> <panel B>", got "${s.name}".`)
      const auto = (meta.auto ?? '').trim().toLowerCase()
      if (auto !== '' && auto !== 'yes' && auto !== 'no') throw new Error(`Link ${s.name}: auto must be yes or no.`)
      const capText = (meta.cap ?? '').trim()
      const capUsd = capText === '' ? undefined : Number(capText.replace(/^\$/, ''))
      if (capUsd !== undefined && (!Number.isFinite(capUsd) || capUsd < 0)) throw new Error(`Link ${s.name}: cap must be a dollar amount, got "${capText}".`)
      links.push({ a: m[1].trim(), b: m[2].trim(), auto: auto === 'yes', ...(capUsd !== undefined ? { capUsd } : {}) })
    } else {
      if (!s.name) throw new Error('Every trigger needs a name after "## Trigger:".')
      const panel = (meta.panel ?? '').trim()
      if (!panel) throw new Error(`Trigger ${s.name} has no panel.`)
      triggers.push({ name: s.name, panel, when: (meta.when ?? '').trim(), prompt: unesc(prose) })
    }
  }

  if (!panels.length) throw new Error('The team has no panels. Add at least one "## Panel:" section.')
  if (panels.length > MAX_PANELS) throw new Error(`A team has at most ${MAX_PANELS} panels; this one has ${panels.length}.`)
  const seen = new Set<string>()
  for (const p of panels) {
    if (seen.has(p.name)) throw new Error(`Two panels are named "${p.name}". Panel names must be unique.`)
    seen.add(p.name)
  }
  for (const l of links) {
    for (const n of [l.a, l.b]) if (!seen.has(n)) throw new Error(`A link names panel "${n}", which is not in the team.`)
    if (l.a === l.b) throw new Error(`A link must join two different panels; "${l.a}" is joined to itself.`)
  }
  for (const r of triggers) if (!seen.has(r.panel)) throw new Error(`Trigger ${r.name} names panel "${r.panel}", which is not in the team.`)

  return { name, description: pre.join('\n').trim(), panels, links, triggers }
}

/** The leading "- key: value" lines (known keys only) are metadata; a blank line or anything else starts the prose. */
function splitBody(body: string[]): { meta: Record<string, string>; prose: string } {
  const meta: Record<string, string> = {}
  let i = 0
  while (i < body.length && body[i].trim() === '') i++
  for (; i < body.length; i++) {
    const m = new RegExp(`^- (${META.join('|')}):(.*)$`).exec(body[i])
    if (!m) break
    meta[m[1]] = m[2].trim()
  }
  return { meta, prose: body.slice(i).join('\n').trim() }
}

/** One line per thing an import will create, shown to the person before anything is made. */
export function reviewLines(t: Team): string[] {
  const out: string[] = []
  for (const p of t.panels) out.push(`Panel ${p.name} in ${p.folder}${p.persona ? `, persona ${p.persona}` : ''}`)
  for (const l of t.links) out.push(`Link ${l.a} <-> ${l.b}, ${l.auto ? 'starts on its own' : 'waits'}${l.capUsd !== undefined ? `, cap $${l.capUsd.toFixed(2)}` : ''}`)
  for (const r of t.triggers) out.push(`Trigger ${r.name} for ${r.panel}${r.when ? ` (${r.when})` : ''} (comes in turned off)`)
  return out
}
