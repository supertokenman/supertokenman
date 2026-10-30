// The panel's live plan, read from the tool calls of a run: the latest well-formed TodoWrite gives the items,
// Task/Agent calls count subagents, and the spawn tools count panels started. Pure: callers pass the calls.

export type PlanItem = { text: string; status: 'pending' | 'in_progress' | 'completed'; active?: string }
export type Plan = {
  panel: string
  sessionId: string
  turn: number
  at: number
  items: PlanItem[]
  agents: { used: number; cap: number }
  fanout: { used: number; cap: number }
}
export type ToolUse = { name: string; input: unknown }
export type PlanInput = { panel: string; sessionId: string; turn: number; at: number; calls: ToolUse[]; agentCap?: number; fanoutCap?: number }

export const AGENT_CAP = 8
export const FANOUT_CAP = 5
const STATUSES = new Set(['pending', 'in_progress', 'completed'])
const MAX_TEXT = 500

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const baseName = (name: string) => {
  const i = name.lastIndexOf('__')
  return i < 0 ? name : name.slice(i + 2)
}

/** The items of one TodoWrite input, or null when the input is malformed. Bad items are skipped. */
function itemsOf(input: unknown): PlanItem[] | null {
  if (!isObj(input) || !Array.isArray(input.todos)) return null
  const out: PlanItem[] = []
  for (const t of input.todos) {
    if (!isObj(t) || typeof t.content !== 'string' || !STATUSES.has(t.status as string)) continue
    const text = t.content.trim().slice(0, MAX_TEXT)
    if (!text) continue
    const item: PlanItem = { text, status: t.status as PlanItem['status'] }
    if (typeof t.activeForm === 'string' && t.activeForm.trim()) item.active = t.activeForm.trim().slice(0, MAX_TEXT)
    out.push(item)
  }
  return out
}

/** How many panels one spawn call starts: ui_open_panels takes a list, delegate starts one worker. */
function panelsStarted(name: string, input: unknown): number {
  const base = baseName(name)
  if (base === 'delegate') return 1
  if (base === 'ui_open_panels') {
    const panels = isObj(input) ? input.panels : undefined
    return Array.isArray(panels) ? panels.length : 0
  }
  return 0
}

/** The plan for the run: items from the latest valid TodoWrite (none yet gives an empty list), and the counts. */
export function planFrom(p: PlanInput): Plan {
  let items: PlanItem[] = []
  let agents = 0
  let fanout = 0
  for (const c of p.calls) {
    if (!c || typeof c.name !== 'string') continue
    const base = baseName(c.name)
    if (base === 'TodoWrite') {
      const list = itemsOf(c.input)
      if (list) items = list
    } else if (base === 'Task' || base === 'Agent') {
      agents++
    } else {
      fanout += panelsStarted(c.name, c.input)
    }
  }
  return {
    panel: p.panel,
    sessionId: p.sessionId,
    turn: p.turn,
    at: p.at,
    items,
    agents: { used: agents, cap: p.agentCap ?? AGENT_CAP },
    fanout: { used: fanout, cap: p.fanoutCap ?? FANOUT_CAP },
  }
}
