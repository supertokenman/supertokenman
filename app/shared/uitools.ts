// Pure logic behind the ui_* tools of the stm MCP server: argument checks, where the canvas cards go for
// row, column and grid, and which links may be drawn. No Electron here, so it is tested on its own.
import { z } from 'zod'
import { CARD_GAP, CARD_H, CARD_W, defaultRect, type Point } from './canvas.js'

export const UI_LAYOUTS = ['auto', 'grid', 'columns', 'canvas'] as const
export type UiLayout = (typeof UI_LAYOUTS)[number]
/** What a model may say for a layout: the app's own ids, plus "row" for columns. */
export const LAYOUT_ALIASES: Record<string, UiLayout> = { auto: 'auto', grid: 'grid', columns: 'columns', column: 'columns', row: 'columns', canvas: 'canvas' }
export const ARRANGE_MODES = ['fit', 'row', 'column', 'grid'] as const
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
export function checkOpen(raw: { panels?: unknown; layout?: unknown }): Res<{ panels: PanelSpec[]; layout?: UiLayout }> {
  const p = z.array(panelSpecSchema).min(1, 'Give at least one panel.').max(MAX_OPEN, `At most ${MAX_OPEN} panels at once.`).safeParse(raw.panels)
  if (!p.success) return { ok: false, error: p.error.issues.map((i) => `panels${i.path.length ? `.${i.path.join('.')}` : ''}: ${i.message}`).join('; ') }
  let layout: UiLayout | undefined
  if (raw.layout !== undefined) {
    const l = checkLayout(raw.layout)
    if (!l.ok) return l
    layout = l.value
  }
  return { ok: true, value: { panels: p.data, layout } }
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

/** Card positions for row, column or grid; null for fit, which moves nothing. */
export function planArrange(mode: ArrangeMode, ids: string[]): Record<string, Point> | null {
  if (mode === 'fit') return null
  const cols = mode === 'row' ? Math.max(1, ids.length) : mode === 'column' ? 1 : Math.max(1, Math.ceil(Math.sqrt(ids.length)))
  const out: Record<string, Point> = {}
  ids.forEach((id, i) => {
    const r = defaultRect(i, cols)
    out[id] = { x: r.x, y: r.y }
  })
  return out
}

export { CARD_GAP, CARD_H, CARD_W }
