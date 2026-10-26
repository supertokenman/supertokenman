// Phase 93: the rules every app icon keeps, checked on its rendered SVG: the 16 px box, the stroke, no
// fixed colours, nothing outside the box, and straight lines only at multiples of 45° (the brand's cut).

export type Finding = { rule: 'viewbox' | 'stroke' | 'colour' | 'bounds' | 'angle'; detail: string }

const NUM = /-?\d*\.?\d+(?:e-?\d+)?/gi
const near = (a: number, b: number) => Math.abs(a - b) < 0.6

/** Straight segments of a path (M, L, H, V, Z, absolute and relative); curves move the pen but are not checked. */
export function straightSegments(d: string): [number, number, number, number][] {
  const out: [number, number, number, number][] = []
  let x = 0, y = 0, sx = 0, sy = 0
  for (const m of d.matchAll(/([MLHVZCSQTA])([^MLHVZCSQTA]*)/gi)) {
    const cmd = m[1]!
    const n = (m[2]!.match(NUM) ?? []).map(Number)
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    const line = (nx: number, ny: number) => (out.push([x, y, nx, ny]), (x = nx), (y = ny))
    if (C === 'M') {
      for (let i = 0; i + 1 < n.length; i += 2) {
        const nx = rel ? x + n[i]! : n[i]!, ny = rel ? y + n[i + 1]! : n[i + 1]!
        if (i === 0) { x = nx; y = ny; sx = x; sy = y } else line(nx, ny)
      }
    } else if (C === 'L') for (let i = 0; i + 1 < n.length; i += 2) line(rel ? x + n[i]! : n[i]!, rel ? y + n[i + 1]! : n[i + 1]!)
    else if (C === 'H') for (const v of n) line(rel ? x + v : v, y)
    else if (C === 'V') for (const v of n) line(x, rel ? y + v : v)
    else if (C === 'Z') line(sx, sy)
    else {
      // a curve or arc: the pen ends at its last point
      const step = { C: 6, S: 4, Q: 4, T: 2, A: 7 }[C as 'C'] ?? 2
      for (let i = 0; i + step - 1 < n.length; i += step) {
        x = rel ? x + n[i + step - 2]! : n[i + step - 2]!
        y = rel ? y + n[i + step - 1]! : n[i + step - 1]!
      }
    }
  }
  return out.filter(([a, b, c, e]) => Math.hypot(c - a, e - b) > 0.01)
}

/** The angle of a segment off the nearest multiple of 45°, in degrees. */
export function offAngle([x1, y1, x2, y2]: [number, number, number, number]): number {
  const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
  const r = ((deg % 45) + 45) % 45
  return Math.min(r, 45 - r)
}

const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w-:]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]))

/** Findings for one rendered icon; an empty list is a pass. Short segments (under 1.5 px) bend freely. */
export function checkIcon(svg: string, tolerance = 2): Finding[] {
  const f: Finding[] = []
  const root = attrs(/<svg\b[^>]*>/.exec(svg)?.[0] ?? '')
  if (root.viewBox !== '0 0 16 16') f.push({ rule: 'viewbox', detail: `viewBox is "${root.viewBox ?? 'missing'}"` })
  if (root.stroke !== 'currentColor' || root['stroke-width'] !== '1.5') f.push({ rule: 'stroke', detail: 'the root must stroke in currentColor at 1.5' })
  for (const m of svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{3,8}|rgb[^"]*)"/gi)) f.push({ rule: 'colour', detail: `fixed colour ${m[1]}` })
  for (const p of svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) {
    for (const s of straightSegments(p[1]!)) {
      if (s.some((v) => v < -0.5 || v > 16.5)) f.push({ rule: 'bounds', detail: `segment ${s.map((v) => +v.toFixed(2)).join(',')} leaves the box` })
      else if (Math.hypot(s[2] - s[0], s[3] - s[1]) >= 1.5 && offAngle(s) > tolerance) f.push({ rule: 'angle', detail: `segment ${s.map((v) => +v.toFixed(2)).join(',')} at ${offAngle(s).toFixed(1)}° off 45°` })
    }
  }
  for (const c of svg.matchAll(/<(?:rect|circle|ellipse|line)\b[^>]*>/g)) {
    const a = attrs(c[0])
    const xs = [a.x, a.cx, a.x1, a.x2].filter(Boolean).map(Number)
    const ys = [a.y, a.cy, a.y1, a.y2].filter(Boolean).map(Number)
    if ([...xs, ...ys].some((v) => v < -0.5 || v > 16.5)) f.push({ rule: 'bounds', detail: `${c[0].slice(0, 40)} leaves the box` })
  }
  void near
  return f
}
