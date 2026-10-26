// Phase 97: one meter for what the app kept out of a panel's context, layer by layer. Each layer counts
// only its own step, measured on the text it changed, so they add up without counting twice: the
// compactor and the scripts work on what the app sends, the condenser and re-reads on tool output,
// and Headroom (a proxy for every panel at once) stays out of the per-panel sum.
// Token counts here are estimates from characters, so the meter shows a range, never one exact figure.

export type Layer = 'compactor' | 'scripts' | 'condenser' | 'reread' | 'symbolic'
export const LAYERS: { id: Layer; name: string }[] = [
  { id: 'compactor', name: 'Compactor' },
  { id: 'scripts', name: 'Scripts' },
  { id: 'condenser', name: 'Output condenser' },
  { id: 'reread', name: 'Re-reads' },
  { id: 'symbolic', name: 'Short-term compression' },
]
export type Meter = Partial<Record<Layer, number>>

export const add = (m: Meter, layer: Layer, tokens: number): Meter => (tokens > 0 && Number.isFinite(tokens) ? { ...m, [layer]: (m[layer] ?? 0) + Math.round(tokens) } : m)
export const total = (m: Meter) => LAYERS.reduce((a, l) => a + (m[l.id] ?? 0), 0)

/** About 4 characters a token, give or take; the range is what the meter shows. */
export const range = (tokens: number): [number, number] => [Math.round(tokens * 0.85), Math.round(tokens * 1.15)]

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n))
export function label(m: Meter): string {
  const t = total(m)
  if (!t) return ''
  const [lo, hi] = range(t)
  return `${k(lo)}–${k(hi)} kept out`
}
export function detail(m: Meter): string[] {
  return LAYERS.filter((l) => m[l.id]).map((l) => {
    const [lo, hi] = range(m[l.id]!)
    return `${l.name}: ${k(lo)}–${k(hi)} tokens`
  })
}
