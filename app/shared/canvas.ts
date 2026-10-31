/** Geometry for the Canvas layout: where cards start, how the view frames them, where link lines meet them. */
export type Rect = { x: number; y: number; w: number; h: number }
export type View = { x: number; y: number; zoom: number }
export type Point = { x: number; y: number }

export const CARD_W = 560
export const CARD_H = 420
export const CARD_GAP = 40
export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 1.5

export const clampZoom = (z: number) => (Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : 1)

/** The i-th card of a tidy grid, `cols` across, for panels that were never moved. */
export function defaultRect(i: number, cols = 3): Rect {
  const c = Math.max(1, cols)
  return { x: CARD_GAP + (i % c) * (CARD_W + CARD_GAP), y: CARD_GAP + Math.floor(i / c) * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H }
}

/** Saved spots where there are any; the rest go to the first default slot no card already covers. */
export function place(ids: string[], saved: Record<string, Point | undefined>, cols = 3): Record<string, Rect> {
  const out: Record<string, Rect> = {}
  for (const id of ids) {
    const s = saved[id]
    if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) out[id] = { x: s.x, y: s.y, w: CARD_W, h: CARD_H }
  }
  let slot = 0
  for (const id of ids) {
    if (out[id]) continue
    let r = defaultRect(slot++, cols)
    while (Object.values(out).some((o) => overlaps(o, r))) r = defaultRect(slot++, cols)
    out[id] = r
  }
  return out
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** The box around all cards, or null with none. */
export function bounds(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y))
  const x2 = Math.max(...rects.map((r) => r.x + r.w)), y2 = Math.max(...rects.map((r) => r.y + r.h))
  return { x, y, w: x2 - x, h: y2 - y }
}

/** The view that shows every card centred in a viewport of `vw` by `vh`, with a margin. */
export function fit(rects: Rect[], vw: number, vh: number, margin = 32): View {
  const b = bounds(rects)
  if (!b || vw <= 0 || vh <= 0) return { x: 0, y: 0, zoom: 1 }
  const zoom = clampZoom(Math.min((vw - margin * 2) / b.w, (vh - margin * 2) / b.h, 1))
  return { x: (vw - b.w * zoom) / 2 - b.x * zoom, y: (vh - b.h * zoom) / 2 - b.y * zoom, zoom }
}

/** Zoom by `factor` keeping the canvas point under the screen point (px, py) where it is. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const zoom = clampZoom(v.zoom * factor)
  const k = zoom / v.zoom
  return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
}

/** Where the line from a's centre to b's centre leaves the edge of a rect. */
function edge(r: Rect, toward: Point): Point {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  const dx = toward.x - cx, dy = toward.y - cy
  if (!dx && !dy) return { x: cx, y: cy }
  const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity)
  return { x: cx + dx * t, y: cy + dy * t }
}

/** The two ends of a link line, each on its card's border, facing the other card. */
export function linkEnds(a: Rect, b: Rect): [Point, Point] {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  return [edge(a, cb), edge(b, ca)]
}

/** Each undirected link once, as a sorted pair key. */
export function uniquePairs(links: Record<string, { panel: string }[]>): [string, string][] {
  const seen = new Set<string>()
  const out: [string, string][] = []
  for (const [a, ls] of Object.entries(links)) for (const l of ls) {
    const [x, y] = a < l.panel ? [a, l.panel] : [l.panel, a]
    if (x === y || seen.has(`${x}|${y}`)) continue
    seen.add(`${x}|${y}`)
    out.push([x, y])
  }
  return out
}

export const FAN_GAP = 200
/** how much wider a lead's card is than a worker's (its height grows by three quarters of it) */
export const LEAD_GROW = 96

/** Lead on the left, its workers in a column to the right, far enough away that the edges have room to curve. */
export function planFan(lead: Point, workers: string[]): Record<string, Point> {
  const step = CARD_H + 40
  const top = lead.y + CARD_H / 2 - (step * (workers.length - 1) + CARD_H) / 2
  return Object.fromEntries(workers.map((w, i) => [w, { x: lead.x + CARD_W + FAN_GAP, y: top + i * step }]))
}

/** A cubic from one card's side to another's, with real curvature: right side of the left card to the left side of the right one. */
export function edgePath(a: Rect, b: Rect): { p: Point; q: Point; d: string; back: string } {
  const right = b.x + b.w / 2 >= a.x + a.w / 2
  const p = { x: right ? a.x + a.w : a.x, y: a.y + a.h / 2 }
  const q = { x: right ? b.x : b.x + b.w, y: b.y + b.h / 2 }
  const k = Math.max(70, Math.abs(q.x - p.x) * 0.5) * (right ? 1 : -1)
  const c1 = { x: p.x + k, y: p.y }, c2 = { x: q.x - k, y: q.y }
  return { p, q, d: `M${p.x},${p.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${q.x},${q.y}`, back: `M${q.x},${q.y} C${c2.x},${c2.y} ${c1.x},${c1.y} ${p.x},${p.y}` }
}
