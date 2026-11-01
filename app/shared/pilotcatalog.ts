// Pilot command catalog: one typed spec per Cmd+K command, so the agent drives the app through the same
// ids the palette shows. Pure: no electron, no react. The renderer runner (src/pilotRun.ts) maps each id
// to its closure; a palette id with no spec and no `agent: false` mark fails src/pilotRun.test.ts.
//
// Tiers (shared/pilottier.ts resolves them): free = view, open a screen, layout, focus; ask = starts
// work or changes the machine (confirm card unless a rule allows a clean turn); confirm = always asks.
// The tier follows the command's real effect, not its label: most palette entries only open a sheet.
import { LAYOUTS } from './layout.js'

export type Tier = 'free' | 'ask' | 'confirm'
export type ArgType = 'string' | 'number' | 'boolean' | 'enum'
/** `max` is a length for strings and a value for numbers. Strings default to 1000 characters. */
export type ArgDef = { type: ArgType; values?: readonly string[]; optional?: boolean; max?: number; describe: string }
export type ArgSchema = Record<string, ArgDef>
export type UndoKind = 'layout' | 'panels' | 'setting' | 'routine' | 'none'
export type CommandSpec = {
  /** palette id as the palette shows it; family specs use the pattern, e.g. `layout-<id>` */
  id: string
  title: string
  group: string
  args: ArgSchema
  tier: Tier
  /** false: needs a picker, a file dialog or typing the person must do */
  agent: boolean
  undo?: UndoKind
  effect?: 'irreversible'
}

const STRING_MAX = 1000

/** `[id, title, tier, agent, undo]` for the static palette entries (`go-<id>` in the palette). */
const STATIC: readonly (readonly [string, string, Tier, boolean, UndoKind])[] = [
  ['today', 'Today', 'free', true, 'none'],
  ['agenda', 'Agenda', 'free', true, 'none'],
  ['prs', 'Pull requests', 'free', true, 'none'],
  ['docker', 'Docker', 'free', true, 'none'],
  ['ports', 'Ports', 'free', true, 'none'],
  ['news', 'News', 'free', true, 'none'],
  ['team', 'Team room', 'free', true, 'none'],
  ['publish', 'Publish', 'free', true, 'none'],
  ['validate', 'Validate', 'free', true, 'none'],
  ['spend', 'Spend', 'free', true, 'none'],
  ['worktree', 'New panel in a worktree', 'ask', false, 'none'],
  ['lab', 'Lab', 'free', true, 'none'],
  ['stm', 'Install the stm command', 'ask', false, 'none'],
  ['api2mcp', 'API to MCP: turn a free API into an MCP server', 'free', true, 'none'],
  ['mcphealth', 'MCP health: servers alive, changed tools, context cost', 'free', true, 'none'],
  ['mcpapprovals', 'MCP approvals: reads run, writes ask', 'free', true, 'none'],
  ['mcpinspector', 'MCP inspector: see and call any MCP server', 'free', true, 'none'],
  ['mcpcatalog', 'MCP catalog: find, review and install MCP servers', 'free', true, 'none'],
  ['prometheus', 'Prometheus: alerts, targets, PromQL charts', 'free', true, 'none'],
  ['analytics', 'Product analytics: your PostHog', 'free', true, 'none'],
  ['security', 'Security scan: vulnerabilities, misconfigurations, licenses, SBOM', 'free', true, 'none'],
  ['workbench', 'Workbench: prompt library, prompts.chat, filters', 'free', true, 'none'],
  ['shot2code', 'Screenshot to code: an image becomes HTML or React', 'free', true, 'none'],
  ['modelservers', 'Model servers: vLLM, llama.cpp, LM Studio as the local model', 'free', true, 'none'],
  ['monitoring', 'Monitoring: uptime of your sites and ports, Netdata alarms', 'free', true, 'none'],
  ['observe', 'Observability: traces, ratings, datasets and experiments', 'free', true, 'none'],
  ['pubcal', 'Publishing calendar: posts on a week', 'free', true, 'none'],
  ['config', 'Providers and config: endpoint, MCP and skills per persona, sessions', 'free', true, 'none'],
  ['diagrams', 'Diagrams: draw.io from a description', 'free', true, 'none'],
  ['oneinbox', 'Inbox: mail and mentions to triage', 'free', true, 'none'],
  ['documents', 'Documents: inbox, filed, search, rules', 'free', true, 'none'],
  ['research', 'Research: a report with sources', 'free', true, 'none'],
  ['webreader', 'Web reader: try a page, cache rules, search, schemas', 'free', true, 'none'],
  ['teamfile', 'Team file: export or import', 'free', false, 'none'],
  ['design', 'Design', 'free', true, 'none'],
  ['deploys', 'Deploys', 'free', true, 'none'],
  ['trace', 'Trace', 'free', true, 'none'],
  ['spec', 'Spec first', 'free', true, 'none'],
  ['try-ways', 'Try several ways', 'free', true, 'none'],
  ['skill-drafts', 'Skill drafts', 'free', true, 'none'],
  ['skill-draft-now', 'Draft a skill from this panel', 'ask', true, 'none'],
  ['modules', 'Modules', 'free', true, 'none'],
  ['backtest', 'Backtest lab', 'free', true, 'none'],
  ['photos', 'Photos', 'free', true, 'none'],
  ['video-meta', 'Video metadata', 'free', true, 'none'],
  ['booking', 'Scheduling link', 'free', true, 'none'],
  ['learn', 'Learn by building', 'free', true, 'none'],
  ['self-host', 'Self-hosting', 'free', true, 'none'],
  ['arch-desk', 'Architecture desk', 'free', true, 'none'],
  ['boot-anim', 'Turn the opening and closing animation on or off', 'free', true, 'setting'],
  ['memory-items', 'Memory items', 'free', true, 'none'],
  ['diagnostics', 'Diagnostics', 'free', true, 'none'],
  ['routines', 'Routines', 'free', true, 'none'],
  ['work-tasks', 'Tasks across panels', 'free', true, 'none'],
  ['control-rules', 'Control rules', 'free', true, 'none'],
  ['control-audit', 'Audit log', 'free', true, 'none'],
  ['playbooks', 'Playbooks', 'free', true, 'none'],
  ['msg-filters', 'Message filters', 'free', true, 'none'],
  ['extract', 'Extract with sources', 'free', true, 'none'],
  ['phone', 'Phone companion', 'free', true, 'none'],
  ['connect-agents', 'Connect other agents', 'free', true, 'none'],
  ['backend-map', 'Backend map', 'free', true, 'none'],
  ['ask-data', 'Ask your data', 'free', true, 'none'],
  ['short-term', 'Short-term compression: long tool results as one line', 'free', true, 'none'],
  ['project-graph', 'Project graph: what depends on what, which decisions touch it', 'free', true, 'none'],
  ['session-review', 'Session review: what to keep from finished sessions', 'free', true, 'none'],
  ['check-after-edits', 'Check after edits: new type or lint errors back to Claude', 'free', true, 'none'],
  ['compose-stacks', 'Compose stacks: edit, start, stop, logs', 'free', true, 'none'],
  ['image-xray', 'Image X-ray: Docker layers and waste', 'free', true, 'none'],
  ['while-away', 'While you were away', 'free', true, 'none'],
  ['run-ci', 'Run CI here with act, before the push', 'free', true, 'none'],
  ['post-brief', 'Brief a post: summary and the best prompt from a link or screenshot', 'free', true, 'none'],
  ['mentions', 'Mentions: draft a brief for people who ask you in a mention', 'free', true, 'none'],
  ['post-everywhere', 'Post everywhere: one post to the networks you connect', 'free', true, 'none'],
  ['topic-radar', 'Topic radar: your topics in your feeds', 'free', true, 'none'],
  ['bitwarden', 'Bitwarden or Vaultwarden: link secrets', 'free', false, 'none'],
  ['app-containers', 'App containers: what the app runs in Docker, live', 'free', true, 'none'],
  ['pdf-tools', 'PDF tools: merge, split, compress, OCR, redact', 'free', true, 'none'],
  ['vault-board', 'Vault board: notes by frontmatter, table or kanban', 'free', true, 'none'],
  ['design-handoff', 'Design handoff: DESIGN.md and HTML preview', 'free', true, 'none'],
  ['md-images', 'Publish images in a Markdown file', 'free', false, 'none'],
  ['office-files', 'Office files', 'free', true, 'none'],
  ['design-system', 'Design system', 'free', true, 'none'],
  ['remote-panel', 'Panel on another machine (SSH)', 'free', false, 'none'],
  ['issue', 'Panel from an issue', 'free', false, 'none'],
  ['past', 'Search past sessions', 'free', true, 'none'],
  ['fanout', 'Fan-out scoreboard', 'free', true, 'none'],
  ['budgets', 'Budgets', 'free', true, 'none'],
  ['savings', 'Savings', 'free', true, 'none'],
  ['database', 'Database', 'free', true, 'none'],
  ['api', 'API client', 'free', true, 'none'],
  ['quick-ask', 'Quick ask (local)', 'free', true, 'none'],
  ['local-model', 'Local model', 'free', true, 'none'],
  ['cloud', 'Cloud', 'free', true, 'none'],
  ['secrets', 'Secrets', 'free', true, 'none'],
  ['health', 'Health', 'free', true, 'none'],
  ['markets', 'Markets', 'free', true, 'none'],
  ['memory', 'Memory', 'free', true, 'none'],
  ['catalog', 'Catalog', 'free', true, 'none'],
  ['business', 'Business', 'free', true, 'none'],
  ['studio', 'Design studio', 'free', true, 'none'],
  ['triggers', 'Triggers', 'free', true, 'none'],
  ['personas', 'Personas', 'free', true, 'none'],
  ['connections', 'Connections', 'free', true, 'none'],
  ['mail', 'Mail', 'free', true, 'none'],
  ['tour', 'Tour', 'free', true, 'none'],
  ['appearance', 'Appearance', 'free', true, 'none'],
  ['focus', 'Focus', 'free', true, 'none'],
  ['private', 'Show or hide the app in screen sharing', 'free', true, 'setting'],
]

const GO: CommandSpec[] = STATIC.map(([id, title, tier, agent, undo]) => ({
  id: `go-${id}`,
  title,
  group: 'Go to',
  args: {},
  tier,
  agent,
  undo,
}))

/** Dynamic families: one spec with an argument, matched by prefix. The arg is the rest of the id. */
export type Family = { prefix: string; arg: string; spec: CommandSpec }

const FAMILIES: Family[] = [
  { prefix: 'layout-', arg: 'id', spec: { id: 'layout-<id>', title: 'Change the layout', group: 'Layout', args: { id: { type: 'enum', values: LAYOUTS.map((l) => l.id), describe: 'layout id' } }, tier: 'free', agent: true, undo: 'layout' } },
  { prefix: 'panel-', arg: 'sid', spec: { id: 'panel-<sid>', title: 'Focus a panel', group: 'Panels', args: { sid: { type: 'string', max: 64, describe: 'panel session id' } }, tier: 'free', agent: true, undo: 'none' } },
  { prefix: 'open-', arg: 'cwd', spec: { id: 'open-<cwd>', title: 'Open a panel in a recent folder', group: 'Recent folders', args: { cwd: { type: 'string', max: 1024, describe: 'absolute folder path' } }, tier: 'ask', agent: true, undo: 'panels' } },
  { prefix: 'persona-', arg: 'id', spec: { id: 'persona-<id>', title: 'Start a panel with a persona', group: 'Personas', args: { id: { type: 'string', max: 64, describe: 'persona id' } }, tier: 'ask', agent: true, undo: 'panels' } },
  // per-item palette entries the agent does not pick: meetings, PRs, stories, secrets, content pieces, web apps
  ...(['ev-', 'pr-', 'news-', 'secret-', 'piece-', 'app-'] as const).map((prefix): Family => ({ prefix, arg: 'id', spec: { id: `${prefix}<id>`, title: 'Palette item', group: 'Items', args: {}, tier: 'free', agent: false, undo: 'none' } })),
]

/** Every spec: the static ones and one per family. */
export const COMMANDS: readonly CommandSpec[] = [...GO, ...FAMILIES.map((f) => f.spec)]

export type Resolved = { spec: CommandSpec; args: Record<string, unknown> }

/** Resolve a palette id: exact static id first, then the family prefix. Null when the id is unknown. */
export function findCommand(id: string): Resolved | null {
  const exact = GO.find((s) => s.id === id)
  if (exact) return { spec: exact, args: {} }
  for (const f of FAMILIES) {
    if (id.startsWith(f.prefix) && id.length > f.prefix.length) return { spec: f.spec, args: { [f.arg]: id.slice(f.prefix.length) } }
  }
  return null
}

export type Check = { ok: true; args: Record<string, string | number | boolean> } | { ok: false; error: string }

/** Check args against a spec: types, enum values, max, required keys, and unknown keys (rejected). */
export function validateArgs(spec: CommandSpec, args: unknown): Check {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'args must be an object' }
  const input = args as Record<string, unknown>
  const out: Record<string, string | number | boolean> = {}
  for (const key of Object.keys(input)) if (!(key in spec.args)) return { ok: false, error: `unknown argument: ${key}` }
  for (const [name, def] of Object.entries(spec.args)) {
    const v = input[name]
    if (v === undefined) {
      if (def.optional) continue
      return { ok: false, error: `missing argument: ${name}` }
    }
    if (def.type === 'string') {
      if (typeof v !== 'string') return { ok: false, error: `${name} must be a string` }
      if (v.length > (def.max ?? STRING_MAX)) return { ok: false, error: `${name} is longer than ${def.max ?? STRING_MAX} characters` }
    } else if (def.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: `${name} must be a number` }
      if (def.max !== undefined && v > def.max) return { ok: false, error: `${name} is above ${def.max}` }
    } else if (def.type === 'boolean') {
      if (typeof v !== 'boolean') return { ok: false, error: `${name} must be true or false` }
    } else if (typeof v !== 'string' || !def.values?.includes(v)) {
      return { ok: false, error: `${name} must be one of: ${(def.values ?? []).join(', ')}` }
    }
    out[name] = v as string | number | boolean
  }
  return { ok: true, args: out }
}
