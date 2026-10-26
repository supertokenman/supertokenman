// Personas: a panel with a role. Each one sets what Claude is told about its job, which model runs it
// and which integrations it gets. They travel as a Markdown file with a small header, so a colleague
// can read one before importing it.

import { cleanStyles, styleRule } from './styles.js'

export type Persona = {
  id: string
  name: string
  /** one of COLORS, for the chip on the panel */
  color: string
  /** empty: the app's model picker decides */
  model: string
  /** integration ids; empty: the ones turned on in Connections */
  integrations: string[]
  instructions: string
  /** what it may do without asking: read only, ask before changes (the default), or edit files freely */
  access?: Access
  /** how it answers: lean code, action first, says what it skipped */
  styles?: import('./styles.js').StyleId[]
  /** what it may run without asking; dangerous commands are refused at every level */
  autonomy?: import('./autonomy.js').Autonomy
  /** MCP servers installed in Claude Code that this persona does not get */
  mcpOff?: string[]
  /** skills this persona does not get */
  skillsOff?: string[]
}

/** What a persona's off-lists keep away from it, as Claude Code permission rules. */
export const blockedFor = (p?: Pick<Persona, 'mcpOff' | 'skillsOff'>) => [...(p?.mcpOff ?? []).map((n) => `mcp__${n}`), ...(p?.skillsOff ?? []).map((n) => `Skill(${n})`)]

export type Access = 'read' | 'ask' | 'edit'
export const ACCESS: Record<Access, { label: string; what: string }> = {
  read: { label: 'Read only', what: 'Reads and searches; cannot edit files. Commands follow its Commands setting.' },
  ask: { label: 'Asks first', what: 'Asks before every edit. Commands follow its Commands setting.' },
  edit: { label: 'Edits freely', what: 'Edits files without asking (all of it shows in Changes). Commands follow its Commands setting.' },
}

export const COLORS = ['#d97757', '#4f7cff', '#3fae6a', '#b05cff', '#e0a526', '#e5484d', '#2bb3c0', '#8a8f98']

export const STARTERS: Persona[] = [
  {
    id: 'reviewer',
    name: 'Reviewer',
    color: '#4f7cff',
    model: '',
    integrations: ['github'],
    access: 'read',
    instructions:
      'You review code. Read the diff or the files asked about, then report problems ranked by how much they matter: bugs and security first, then correctness at the edges, then clarity. Point to file and line. Do not rewrite code unless asked; propose the smallest fix. Say plainly when something looks fine.',
  },
  {
    id: 'frontend',
    name: 'Frontend',
    color: '#b05cff',
    model: '',
    integrations: ['playwright', 'context7'],
    instructions:
      'You build user interfaces. Match the project’s components, tokens and spacing before adding new ones. Check every change in the real page (the Playwright browser) at phone and desktop widths, in light and dark, before saying it is done. Accessibility is part of done: labels, focus, contrast.',
  },
  {
    id: 'devops',
    name: 'DevOps',
    color: '#3fae6a',
    model: '',
    integrations: ['cloudflare', 'cloudflare-docs', 'github'],
    instructions:
      'You run deploys, CI and infrastructure. Read before you change: show the current state, then the plan, then act. Never delete a resource, rotate a secret or stop a machine without asking first. Prefer reversible steps and say how to roll back.',
  },
  {
    id: 'writer',
    name: 'Writer',
    color: '#e0a526',
    model: '',
    integrations: [],
    instructions:
      'You write docs, READMEs, changelogs and posts. Short sentences, concrete examples, no filler or hype. Match the reader: a README starts with what it is and how to run it. Keep the project’s voice.',
  },
  {
    id: 'marketing',
    name: 'Marketing',
    color: '#e5484d',
    model: '',
    integrations: [],
    instructions:
      'You plan and write marketing: positioning, launch posts, landing copy, campaigns and their numbers. Lead with what the product does for the reader, in their words. Claims must be true and checkable; no hype words. Propose, never publish: every post waits for a person to approve it.',
  },
  {
    id: 'security',
    name: 'Security',
    color: '#8a8f98',
    model: '',
    integrations: ['github'],
    instructions:
      'You look for security problems: secrets in code or history, injection, auth and access mistakes, unsafe dependencies, exposed ports and permissive cloud settings. Rank findings by real risk, show how each could be exploited and the smallest fix. Never run anything that attacks a system you were not asked to test.',
  },
  {
    id: 'data',
    name: 'Data',
    color: '#2bb3c0',
    model: '',
    integrations: [],
    instructions:
      'You answer questions with data: write the query or the script, run it, and say what the numbers mean and how sure you are. Show the query with the result. Check row counts, nulls and duplicates before drawing a conclusion. Never change or delete data unless asked.',
  },
  {
    id: 'designer',
    name: 'Designer',
    color: '#b05cff',
    model: '',
    integrations: ['playwright'],
    instructions:
      'You design screens and flows: layout, hierarchy, spacing, type and states (empty, loading, error). Work inside the product\u2019s existing system and say where you break from it and why. Check alignment and contrast in the real page, in light and dark.',
  },
  {
    id: 'product',
    name: 'Product',
    color: '#d97757',
    model: '',
    integrations: [],
    instructions:
      'You turn ideas into scoped work: the problem, who has it, what done looks like, and the smallest version worth shipping. Write user stories with acceptance criteria and call out risks and open questions. Prefer cutting scope to adding it.',
  },
  {
    id: 'qa',
    name: 'QA',
    color: '#3fae6a',
    model: '',
    integrations: ['playwright'],
    instructions:
      'You test: write and run checks for what changed, then try the edges (empty, huge, slow, offline, wrong input, two at once). Report each bug with steps to reproduce, what happened and what should have. Do not fix unless asked.',
  },
  {
    id: 'support',
    name: 'Support',
    color: '#4f7cff',
    model: '',
    integrations: [],
    instructions:
      'You help users: read their message, find the cause in the code, docs or logs, and write a reply that is short, kind and exact, with the steps that fix it. Say when something is a bug and needs the team. Never promise dates.',
  },
]


const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'persona'

/** A persona from anything: missing fields filled, unknown ones dropped, sizes bounded. */
export function cleanPersona(p: Partial<Persona>): Persona {
  const name = String(p.name ?? '').trim().slice(0, 40) || 'Persona'
  return {
    id: p.id && /^[a-z0-9-]{1,40}$/.test(p.id) ? p.id : slug(name),
    name,
    color: COLORS.includes(String(p.color)) ? String(p.color) : COLORS[0]!,
    model: String(p.model ?? '').trim().slice(0, 80),
    integrations: [...new Set((Array.isArray(p.integrations) ? p.integrations : []).map(String).filter((x) => /^[a-z0-9-]{1,40}$/.test(x)))],
    instructions: String(p.instructions ?? '').trim().slice(0, 8000),
    access: p.access === 'read' || p.access === 'edit' ? p.access : 'ask',
    styles: cleanStyles(p.styles),
    autonomy: p.autonomy === 'trusted' ? 'trusted' : 'supervised',
    ...(p.mcpOff?.length ? { mcpOff: [...new Set(p.mcpOff.map(String).filter((x) => /^[\w.-]{1,64}$/.test(x)))] } : {}),
    ...(p.skillsOff?.length ? { skillsOff: [...new Set(p.skillsOff.map(String).filter((x) => /^[\w.:-]{1,64}$/.test(x)))] } : {}),
  }
}

/** The file a persona travels in. */
export function toMarkdown(p: Persona): string {
  return [
    '---',
    `name: ${p.name}`,
    `color: ${p.color}`,
    `model: ${p.model}`,
    `integrations: ${p.integrations.join(', ')}`,
    `access: ${p.access ?? 'ask'}`,
    ...(p.styles?.length ? [`styles: ${p.styles.join(', ')}`] : []),
    ...(p.autonomy === 'trusted' ? ['autonomy: trusted'] : []),
    '---',
    '',
    p.instructions,
    '',
  ].join('\n')
}

export function fromMarkdown(text: string): Persona {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.trim())
  if (!m) throw new Error('Not a persona file: it starts with a --- header.')
  const head: Record<string, string> = {}
  for (const line of m[1]!.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) head[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  }
  return cleanPersona({
    name: head.name,
    color: head.color,
    model: head.model,
    integrations: (head.integrations ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    access: head.access as Access,
    autonomy: head.autonomy as never,
    styles: (head.styles ?? '').split(',').map((x) => x.trim()).filter(Boolean) as never,
    instructions: m[2]!.trim(),
  })
}

/** What the persona adds to Claude's system prompt. */
export function personaPrompt(p: Persona): string {
  const rule = p.access === 'read' ? '\n\nYou are read-only in this panel: read, search and explain, and propose changes as diffs in your reply; editing tools are not available to you.' : ''
  const style = styleRule(p.styles ?? [])
  return `# Your role in this panel: ${p.name}\n\n${p.instructions}${rule}${style ? `\n\n${style}` : ''}`
}
