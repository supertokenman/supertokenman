// The math under the app's own charts: round axis ticks, time ticks at calendar steps, compact numbers.
// No drawing here; Chart.tsx draws with it.

/** Round tick values that cover [min, max], about `count` of them, always including zero for bars. */
export function niceTicks(min: number, max: number, count = 5, zero = false): number[] {
  let lo = zero ? Math.min(0, min) : min
  let hi = zero ? Math.max(0, max) : max
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1]
  if (lo === hi) {
    hi = lo === 0 ? 1 : lo + Math.abs(lo) * 0.5
    lo = zero ? Math.min(0, lo) : lo - Math.abs(lo) * 0.5
  }
  const raw = (hi - lo) / Math.max(1, count)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const start = Math.floor(lo / step) * step
  const out: number[] = []
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step)
  if (out[out.length - 1]! < hi) out.push(out[out.length - 1]! + step)
  return out.map((v) => (Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12))))
}

/** 1234 -> 1.2k, 2500000 -> 2.5M; small numbers keep up to 2 decimals. */
export function compact(v: number): string {
  const a = Math.abs(v)
  const s = (x: number, u: string) => `${Number(x.toFixed(x < 10 ? 1 : 0))}${u}`
  if (a >= 1e9) return `${v < 0 ? '-' : ''}${s(a / 1e9, 'B')}`
  if (a >= 1e6) return `${v < 0 ? '-' : ''}${s(a / 1e6, 'M')}`
  if (a >= 1e4) return `${v < 0 ? '-' : ''}${s(a / 1e3, 'k')}`
  return String(Number(v.toFixed(a >= 100 ? 0 : 2)))
}

const MIN = 60_000
const H = 60 * MIN
const D = 24 * H
const STEPS = [MIN, 5 * MIN, 15 * MIN, 30 * MIN, H, 3 * H, 6 * H, 12 * H, D, 2 * D, 7 * D, 30 * D, 91 * D, 365 * D]

/** Time ticks at calendar-ish steps (minutes to years), about `count` of them, and how to label them. */
export function timeTicks(from: number, to: number, count = 6): { ticks: number[]; label: (t: number) => string } {
  const span = Math.max(1, to - from)
  const step = STEPS.find((s) => span / s <= count) ?? 365 * D
  const tz = new Date(from).getTimezoneOffset() * MIN
  const first = Math.ceil((from - tz) / step) * step + tz
  const ticks: number[] = []
  for (let t = first; t <= to; t += step) ticks.push(t)
  const d = (t: number) => new Date(t)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const label = step < D ? (t: number) => `${p2(d(t).getHours())}:${p2(d(t).getMinutes())}` : step < 30 * D ? (t: number) => `${p2(d(t).getDate())}/${p2(d(t).getMonth() + 1)}` : (t: number) => `${p2(d(t).getMonth() + 1)}/${d(t).getFullYear()}`
  return { ticks, label }
}

/** A linear scale from a domain to a pixel range. */
export const scale = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0))

/** The index of the point nearest to x in a sorted list of positions. */
export function nearest(xs: number[], x: number): number {
  let best = 0
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i]! - x) < Math.abs(xs[best]! - x)) best = i
  return best
}
