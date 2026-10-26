// Style from a reference: samples of the elements a page shows (their computed colors, fonts, sizes,
// radii, shadows and spacing, with how much of the screen each covers) turned into a small token set,
// the way a designer would read the page: the colors that cover most, the type scale, the radii.

export type Sample = { tag: string; color: string; bg: string; border?: string; font: string; size: number; weight: number; radius: number; shadow: string; padding: number; gap: number; area: number; text: boolean }
export type Tokens = {
  colors: { name: string; value: string; share: number }[]
  fonts: { role: 'body' | 'heading' | 'mono'; family: string }[]
  sizes: number[]
  weights: number[]
  radii: number[]
  spacing: number[]
  shadows: string[]
}

/** rgb(a) to hex; transparent is null. */
export function hex(c: string): string | null {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c)
  if (!m) return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null
  if (m[4] !== undefined && Number(m[4]) < 0.5) return null
  return `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`
}
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const luma = (h: string) => {
  const [r, g, b] = rgb(h)
  return 0.299 * r + 0.587 * g + 0.114 * b
}
const sat = (h: string) => {
  const [r, g, b] = rgb(h)
  const max = Math.max(r, g, b)
  return max ? (max - Math.min(r, g, b)) / max : 0
}
/** Close colors count as one: what a page uses as "the same blue" varies by a few units; a light surface on a light page differs by little more, so the line is tight. */
const near = (a: string, b: string) => rgb(a).reduce((s, v, i) => s + Math.abs(v - rgb(b)[i]!), 0) < 12

function cluster(weighted: [string, number][]): { value: string; weight: number }[] {
  const out: { value: string; weight: number }[] = []
  for (const [c, w] of weighted.sort((a, b) => b[1] - a[1])) {
    const hit = out.find((x) => near(x.value, c))
    if (hit) hit.weight += w
    else out.push({ value: c, weight: w })
  }
  return out.sort((a, b) => b.weight - a.weight)
}

/** The few values that matter in a numeric list, weighted, rounded and sorted. */
function scale(values: [number, number][], round: (n: number) => number, max: number): number[] {
  const m = new Map<number, number>()
  for (const [v, w] of values) if (v > 0) m.set(round(v), (m.get(round(v)) ?? 0) + w)
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([v]) => v).sort((a, b) => a - b)
}

const family = (f: string) => f.split(',')[0]!.trim().replace(/^["']|["']$/g, '')

export function tokensOf(samples: Sample[]): Tokens {
  const total = samples.reduce((s, x) => s + x.area, 0) || 1
  const bgs = cluster(samples.flatMap((s) => (hex(s.bg) ? [[hex(s.bg)!, s.area] as [string, number]] : [])))
  const fgs = cluster(samples.filter((s) => s.text).flatMap((s) => (hex(s.color) ? [[hex(s.color)!, Math.max(1, s.area / 20)] as [string, number]] : [])))
  const page = bgs[0]?.value ?? '#ffffff'
  const surface = bgs.find((c) => c.value !== page && Math.abs(luma(c.value) - luma(page)) < 60)?.value
  const text = fgs[0]?.value ?? (luma(page) > 128 ? '#111111' : '#eeeeee')
  const muted = fgs.find((c) => c.value !== text && sat(c.value) < 0.2)?.value
  // the accent: the most used saturated color, from text, buttons and backgrounds alike
  const accent = cluster([...bgs.map((c) => [c.value, c.weight] as [string, number]), ...fgs.map((c) => [c.value, c.weight * 4] as [string, number])]).find((c) => sat(c.value) > 0.35 && luma(c.value) > 30 && luma(c.value) < 225)?.value
  const borders = cluster(samples.flatMap((s) => (s.border && hex(s.border) ? [[hex(s.border)!, 1] as [string, number]] : [])))
  const named: [string, string | undefined][] = [['background', page], ['surface', surface], ['text', text], ['muted', muted], ['accent', accent], ['border', borders.find((b) => b.value !== text)?.value]]
  const share = (v: string) => Math.round(((bgs.find((c) => c.value === v)?.weight ?? 0) / total) * 100)
  const texts = samples.filter((s) => s.text)
  const fontArea = new Map<string, number>()
  for (const s of texts) fontArea.set(family(s.font), (fontArea.get(family(s.font)) ?? 0) + s.area)
  const body = [...fontArea.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const heading = texts.filter((s) => /^h[1-3]$/.test(s.tag) || s.size >= 24).map((s) => family(s.font))[0]
  const mono = texts.find((s) => /mono|courier|consolas|menlo/i.test(s.font))?.font
  return {
    colors: named.filter((x): x is [string, string] => Boolean(x[1])).map(([name, value]) => ({ name, value, share: share(value) })),
    fonts: [...(body ? [{ role: 'body' as const, family: body }] : []), ...(heading && heading !== body ? [{ role: 'heading' as const, family: heading }] : []), ...(mono ? [{ role: 'mono' as const, family: family(mono) }] : [])],
    sizes: scale(texts.map((s) => [s.size, s.area] as [number, number]), (n) => Math.round(n), 7),
    weights: scale(texts.map((s) => [s.weight, s.area] as [number, number]), (n) => Math.round(n / 100) * 100, 4),
    radii: scale(samples.map((s) => [s.radius, 1] as [number, number]), (n) => (n >= 999 ? 9999 : Math.round(n)), 4),
    spacing: scale(samples.flatMap((s) => [[s.padding, 1], [s.gap, 1]] as [number, number][]), (n) => Math.round(n / 4) * 4, 7),
    shadows: [...new Set(samples.map((s) => s.shadow).filter((x) => x && x !== 'none'))].slice(0, 3),
  }
}

/** The tokens as CSS custom properties. */
export function cssOf(t: Tokens): string {
  const lines = [
    ...t.colors.map((c) => `  --${c.name}: ${c.value};`),
    ...t.fonts.map((f) => `  --font-${f.role}: "${f.family}", ${f.role === 'mono' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'};`),
    ...t.sizes.map((s, i) => `  --text-${i + 1}: ${s}px;`),
    ...t.radii.map((r, i) => `  --radius-${i + 1}: ${r >= 9999 ? '9999px' : `${r}px`};`),
    ...t.spacing.map((s, i) => `  --space-${i + 1}: ${s}px;`),
    ...t.shadows.map((s, i) => `  --shadow-${i + 1}: ${s};`),
  ]
  return `:root {\n${lines.join('\n')}\n}\n`
}

/** The tokens as a Tailwind theme extension. */
export function tailwindOf(t: Tokens): string {
  const obj = {
    colors: Object.fromEntries(t.colors.map((c) => [c.name, c.value])),
    fontFamily: Object.fromEntries(t.fonts.map((f) => [f.role === 'body' ? 'sans' : f.role, [f.family]])),
    fontSize: Object.fromEntries(t.sizes.map((s, i) => [String(i + 1), `${s}px`])),
    borderRadius: Object.fromEntries(t.radii.map((r, i) => [String(i + 1), r >= 9999 ? '9999px' : `${r}px`])),
    spacing: Object.fromEntries(t.spacing.map((s, i) => [`s${i + 1}`, `${s}px`])),
  }
  return `// tailwind.config: theme.extend\n${JSON.stringify(obj, null, 2)}\n`
}

/** Runs in the page: what each visible element looks like and how much of the screen it covers. */
export const COLLECT = `(() => {
  const out = []
  const vw = innerWidth, vh = innerHeight * 3
  for (const el of document.querySelectorAll('html, body, body *')) {
    if (out.length > 2500) break
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.top > vh || r.bottom < 0 || r.left > vw) continue
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.2) continue
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    const area = Math.min(r.width, vw) * Math.min(r.height, vh)
    out.push({ tag: el.tagName.toLowerCase(), color: s.color, bg: s.backgroundColor, border: parseFloat(s.borderTopWidth) > 0 ? s.borderTopColor : undefined, font: s.fontFamily, size: parseFloat(s.fontSize), weight: Number(s.fontWeight) || 400, radius: parseFloat(s.borderTopLeftRadius) || 0, shadow: s.boxShadow, padding: parseFloat(s.paddingTop) || 0, gap: parseFloat(s.rowGap) || 0, area: own ? area : el === document.body || el === document.documentElement ? area : s.backgroundColor === 'rgba(0, 0, 0, 0)' ? 0 : area, text: own })
  }
  // the canvas behind everything: a page with no background of its own shows the browser's, light or dark
  const scheme = getComputedStyle(document.documentElement).colorScheme || ''
  const dark = /dark/.test(scheme) && !/light/.test(scheme) || (/dark/.test(scheme) && matchMedia('(prefers-color-scheme: dark)').matches)
  out.push({ tag: 'canvas', color: '', bg: dark ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)', font: '', size: 0, weight: 0, radius: 0, shadow: 'none', padding: 0, gap: 0, area: 1, text: false })
  return out
})()`
