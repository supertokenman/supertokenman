// Pure logic behind the ui_* tools of the stm MCP server: argument checks, where the canvas cards go for
// row, column and grid, and which links may be drawn. No Electron here, so it is tested on its own.
import { z } from 'zod'
import { CARD_GAP, CARD_H, CARD_W, defaultRect, planFan, type Point } from './canvas.js'

export const UI_LAYOUTS = ['auto', 'grid', 'columns', 'canvas'] as const
export type UiLayout = (typeof UI_LAYOUTS)[number]
/** What a model may say for a layout: the app's own ids, plus "row" for columns. */
export const LAYOUT_ALIASES: Record<string, UiLayout> = { auto: 'auto', grid: 'grid', columns: 'columns', column: 'columns', row: 'columns', canvas: 'canvas' }
export const ARRANGE_MODES = ['fit', 'row', 'column', 'grid', 'fan'] as const
export type ArrangeMode = (typeof ARRANGE_MODES)[number]
export const MAX_OPEN = 8
export const MAX_LINKS = 20

export const layoutSchema = z.string().min(1).max(20)
export const panelSpecSchema = z.object({
  folder: z.string().min(1).max(1000),
  title: z.string().max(80).optional(),
  persona: z.string().max(64).optional(),
  model: z.string().max(100).optional(),
})
export const linkSpecSchema = z.object({ from: z.string().min(1).max(64), to: z.string().min(1).max(64), mode: z.enum(['auto', 'waits']) })

export type PanelSpec = z.infer<typeof panelSpecSchema>
export type LinkSpec = z.infer<typeof linkSpecSchema>
type Res<T> = { ok: true; value: T } | { ok: false; error: string }

/** The layout the app knows for what was asked, or why not. */
export function checkLayout(raw: unknown): Res<UiLayout> {
  const v = typeof raw === 'string' ? LAYOUT_ALIASES[raw.trim().toLowerCase()] : undefined
  return v ? { ok: true, value: v } : { ok: false, error: `Unknown layout "${String(raw)}". Use one of: ${UI_LAYOUTS.join(', ')} ("row" means columns).` }
}

export function checkArrange(raw: unknown): Res<ArrangeMode> {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return (ARRANGE_MODES as readonly string[]).includes(v) ? { ok: true, value: v as ArrangeMode } : { ok: false, error: `Unknown arrange mode "${String(raw)}". Use one of: ${ARRANGE_MODES.join(', ')}.` }
}

/** The panels to open: 1 to MAX_OPEN, each with a folder; the layout, when given, must be known. */
export function checkOpen(raw: { panels?: unknown; layout?: unknown; lead?: unknown }): Res<{ panels: PanelSpec[]; layout?: UiLayout; lead?: string }> {
  const p = z.array(panelSpecSchema).min(1, 'Give at least one panel.').max(MAX_OPEN, `At most ${MAX_OPEN} panels at once.`).safeParse(raw.panels)
  if (!p.success) return { ok: false, error: p.error.issues.map((i) => `panels${i.path.length ? `.${i.path.join('.')}` : ''}: ${i.message}`).join('; ') }
  let layout: UiLayout | undefined
  if (raw.layout !== undefined) {
    const l = checkLayout(raw.layout)
    if (!l.ok) return l
    layout = l.value
  }
  let lead: string | undefined
  if (raw.lead !== undefined) {
    if (typeof raw.lead !== 'string' || !/^[\w-]{1,64}$/.test(raw.lead.trim())) return { ok: false, error: 'lead: "self" (this panel) or the id of an open panel.' }
    lead = raw.lead.trim()
  }
  return { ok: true, value: { panels: p.data, layout, lead } }
}

/** Links between panels that exist: no self links, no repeats, and the cap. Returns each pair once. */
export function checkLinks(raw: unknown, known: ReadonlySet<string>): Res<LinkSpec[]> {
  const p = z.array(linkSpecSchema).min(1, 'Give at least one link.').max(MAX_LINKS, `At most ${MAX_LINKS} links at once.`).safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues.map((i) => `links${i.path.length ? `.${i.path.join('.')}` : ''}: ${i.message}`).join('; ') }
  const seen = new Map<string, LinkSpec>()
  for (const l of p.data) {
    if (l.from === l.to) return { ok: false, error: `A panel cannot link to itself (${l.from}).` }
    for (const id of [l.from, l.to]) if (!known.has(id)) return { ok: false, error: `No panel "${id}". Open panels: ${[...known].join(', ') || 'none'}.` }
    seen.set([l.from, l.to].sort().join('|'), l)
  }
  return { ok: true, value: [...seen.values()] }
}

/** Card positions for row, column, grid or fan; null for fit, which moves nothing. leadOf maps a worker to its lead, for fan. */
export function planArrange(mode: ArrangeMode, ids: string[], leadOf: Record<string, string> = {}): Record<string, Point> | null {
  if (mode === 'fit') return null
  if (mode === 'fan') return planTeams(ids, leadOf)
  const cols = mode === 'row' ? Math.max(1, ids.length) : mode === 'column' ? 1 : Math.max(1, Math.ceil(Math.sqrt(ids.length)))
  const out: Record<string, Point> = {}
  ids.forEach((id, i) => {
    const r = defaultRect(i, cols)
    out[id] = { x: r.x, y: r.y }
  })
  return out
}

/** Each lead on the left with its workers fanned in a column to its right, one team under the other; panels in no team in a row below. */
export function planTeams(ids: string[], leadOf: Record<string, string>): Record<string, Point> {
  const open = new Set(ids)
  const out: Record<string, Point> = {}
  let y = CARD_GAP
  for (const l of ids) {
    if (leadOf[l]) continue
    const ws = ids.filter((w) => leadOf[w] === l)
    if (!ws.length) continue
    const rows = ws.length
    const h = rows * CARD_H + (rows - 1) * 40
    const lead = { x: CARD_GAP, y: y + (h - CARD_H) / 2 }
    out[l] = lead
    Object.assign(out, planFan(lead, ws))
    y += h + CARD_GAP * 2
  }
  const rest = ids.filter((id) => !out[id] && !(leadOf[id] && open.has(leadOf[id]!)))
  rest.forEach((id, i) => (out[id] = { x: CARD_GAP + i * (CARD_W + CARD_GAP), y }))
  // a worker whose lead is closed joins the row
  ids.filter((id) => !out[id]).forEach((id, i) => (out[id] = { x: CARD_GAP + (rest.length + i) * (CARD_W + CARD_GAP), y }))
  return out
}

export { CARD_GAP, CARD_H, CARD_W }

/** What the window knows of an open panel; a panel the person opened but has not yet written to has no session in the main process. */
export type WinPanel = { id: string; folder: string; title: string; state: string }
export type ListedPanel = { id: string; folder: string; name: string; persona: string | null }

/**
 * Every open panel, once: the window's list is the truth for what is open, the main process adds the
 * persona and the session name. A panel with no session yet is listed with the state "not started".
 */
export function listPanels(main: ListedPanel[], win: WinPanel[] | undefined, role: (id: string) => string = () => ''): { id: string; folder: string; name: string; persona: string | null; state: string; role: string }[] {
  const byId = new Map(main.map((p) => [p.id, p]))
  const ids = win ? win.map((w) => w.id) : main.map((p) => p.id)
  for (const p of main) if (!ids.includes(p.id) && !win) ids.push(p.id)
  return ids.map((id) => {
    const m = byId.get(id)
    const w = win?.find((x) => x.id === id)
    return { id, folder: m?.folder || w?.folder || '', name: w?.title || m?.name || id, persona: m?.persona ?? null, state: w?.state ?? (m ? 'ready' : 'not started'), role: role(id) }
  })
}
