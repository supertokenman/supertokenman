// Color math for the palette studio, all local: OKLCH (lightness, chroma, hue as the eye sees them)
// for harmonies, WCAG contrast for text, k-means for an image's colors, and a full app theme built
// from a palette with readable text guaranteed.

import type { Theme } from './themes'

export type Oklch = { l: number; c: number; h: number }

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  const n = parseInt(f.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')

export function toOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map((v) => toLin(v / 255)) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

/** OKLCH to hex, lowering chroma until the color fits in sRGB. */
export function fromOklch({ l, c, h }: Oklch): string {
  for (let cc = c; cc >= 0; cc -= 0.005) {
    const a = cc * Math.cos((h * Math.PI) / 180)
    const b = cc * Math.sin((h * Math.PI) / 180)
    const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
    const rgb = [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S]
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return rgbToHex(...(rgb.map((v) => toGam(clamp(v)) * 255) as [number, number, number]))
  }
  return rgbToHex(...(Array(3).fill(toGam(clamp(l ** 3)) * 255) as [number, number, number]))
}

const shift = (o: Oklch, dh: number, dl = 0, k = 1): string => fromOklch({ l: clamp(o.l + dl, 0.08, 0.97), c: o.c * k, h: (o.h + dh + 360) % 360 })

export const HARMONIES = ['analogous', 'complementary', 'split', 'triadic', 'tetradic', 'monochrome'] as const
export type Harmony = (typeof HARMONIES)[number]

/** Five colors around a seed, in the given harmony. */
export function harmony(seed: string, mode: Harmony): string[] {
  const o = toOklch(seed)
  switch (mode) {
    case 'analogous':
      return [shift(o, -40, 0.06), shift(o, -20, 0.03), seed, shift(o, 20, -0.03), shift(o, 40, -0.06)]
    case 'complementary':
      return [shift(o, 0, 0.18, 0.5), seed, shift(o, 0, -0.18), shift(o, 180), shift(o, 180, 0.15, 0.5)]
    case 'split':
      return [seed, shift(o, 0, 0.15, 0.6), shift(o, 150), shift(o, 210), shift(o, 180, -0.2, 0.4)]
    case 'triadic':
      return [seed, shift(o, 120), shift(o, 240), shift(o, 0, 0.2, 0.4), shift(o, 0, -0.25, 0.6)]
    case 'tetradic':
      return [seed, shift(o, 90), shift(o, 180), shift(o, 270), shift(o, 0, 0.22, 0.35)]
    case 'monochrome':
      return [-0.3, -0.15, 0, 0.13, 0.26].map((dl) => (dl === 0 ? seed : shift(o, 0, dl, dl > 0 ? 0.7 : 1)))
  }
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const L = (hex: string) => {
    const [r, g, bb] = hexToRgb(hex).map((v) => toLin(v / 255)) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb
  }
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}
export const grade = (r: number) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA large' : 'Fail')
/** White or near-black, whichever reads better on the color. */
export const inkOn = (bg: string) => (contrast(bg, '#ffffff') >= contrast(bg, '#141413') ? '#ffffff' : '#141413')

/** The main colors of an image (RGBA bytes), by k-means, most common first. */
export function extract(data: Uint8ClampedArray, k = 6): string[] {
  const px: [number, number, number][] = []
  const step = Math.max(1, Math.floor(data.length / 4 / 4000))
  for (let i = 0; i < data.length; i += 4 * step) if (data[i + 3]! > 200) px.push([data[i]!, data[i + 1]!, data[i + 2]!])
  if (!px.length) return []
  let centers = Array.from({ length: k }, (_, i) => px[Math.floor((i * px.length) / k)]!)
  let counts: number[] = []
  for (let it = 0; it < 12; it++) {
    const sums = centers.map(() => [0, 0, 0, 0])
    for (const p of px) {
      let best = 0
      let bd = Infinity
      centers.forEach((c, j) => {
        const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2
        if (d < bd) (bd = d), (best = j)
      })
      const s = sums[best]!
      s[0]! += p[0]
      s[1]! += p[1]
      s[2]! += p[2]
      s[3]! += 1
    }
    centers = sums.map((s, j) => (s[3] ? [s[0]! / s[3], s[1]! / s[3], s[2]! / s[3]] : centers[j]!) as [number, number, number])
    counts = sums.map((s) => s[3]!)
  }
  return centers
    .map((c, j) => ({ hex: rgbToHex(...c), n: counts[j]! }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((c) => c.hex)
    .filter((h, i, all) => all.indexOf(h) === i)
}

/** Lightness up or down until the color reaches the contrast against bg. */
export function reach(color: string, bg: string, ratio: number): string {
  const o = toOklch(color)
  const up = toOklch(bg).l < 0.5
  for (let i = 0; i < 60 && contrast(fromOklch(o), bg) < ratio; i++) o.l = clamp(o.l + (up ? 0.01 : -0.01))
  return fromOklch(o)
}

/**
 * A whole app theme from a palette: the most colorful color becomes the accent, the neutrals are
 * tinted toward it, and text is pushed until it reads (7:1 for text, 4.5:1 for secondary text,
 * 3:1 for the accent).
 */
export function themeFrom(palette: string[], scheme: 'dark' | 'light', name = 'My palette'): Theme {
  const ok = palette.map((h) => ({ h, o: toOklch(h) }))
  const accent0 = [...ok].sort((a, b) => b.o.c - a.o.c)[0]?.h ?? '#d97757'
  const hue = toOklch(accent0).h
  const n = (l: number, c = 0.012) => fromOklch({ l, c, h: hue })
  const dark = scheme === 'dark'
  const bg = dark ? n(0.16) : n(0.985, 0.006)
  const accent = reach(accent0, bg, 3)
  const ao = toOklch(accent)
  const pickHue = (target: number, fallback: string) => {
    const near = ok.filter((x) => x.o.c > 0.06).sort((a, b) => Math.abs(((a.o.h - target + 540) % 360) - 180) - Math.abs(((b.o.h - target + 540) % 360) - 180))[0]
    const base = near && Math.abs(((near.o.h - target + 540) % 360) - 180) > 140 ? near.h : fallback
    return reach(base, bg, 3)
  }
  return {
    id: 'custom',
    name,
    scheme,
    c: {
      bg,
      surface: dark ? n(0.2) : n(0.96, 0.008),
      raised: dark ? n(0.24) : n(0.93, 0.01),
      hover: dark ? n(0.28) : n(0.9, 0.012),
      sunken: dark ? n(0.13) : n(1, 0),
      text: reach(dark ? n(0.94, 0.008) : n(0.22, 0.01), bg, 7),
      muted: reach(dark ? n(0.7) : n(0.5), bg, 4.5),
      faint: reach(dark ? n(0.5) : n(0.68), bg, 3),
      accent,
      accentHover: fromOklch({ ...ao, l: clamp(ao.l + (dark ? 0.06 : -0.06)) }),
      deep: fromOklch({ ...ao, l: clamp(ao.l - 0.08) }),
      glow: fromOklch({ ...ao, l: clamp(ao.l + 0.18), c: ao.c * 0.6 }),
      onAccent: inkOn(accent),
      green: pickHue(145, dark ? '#9fc48a' : '#4f7a3a'),
      red: pickHue(28, dark ? '#e58a6c' : '#b4462a'),
      gold: pickHue(85, dark ? '#c9a26b' : '#9a7330'),
      blue: pickHue(250, dark ? '#9fb7d9' : '#3f6697'),
    },
  }
}

/** The palette as code to paste: CSS variables, a Tailwind colors block, or design tokens. */
export function exportAs(palette: string[], kind: 'css' | 'tailwind' | 'json', name = 'brand'): string {
  const keys = palette.map((_, i) => `${name}-${(i + 1) * 100}`)
  if (kind === 'css') return `:root {\n${palette.map((h, i) => `  --${keys[i]}: ${h};`).join('\n')}\n}`
  if (kind === 'tailwind') return `colors: {\n  ${name}: {\n${palette.map((h, i) => `    ${(i + 1) * 100}: '${h}',`).join('\n')}\n  },\n}`
  return JSON.stringify({ color: { [name]: Object.fromEntries(palette.map((h, i) => [(i + 1) * 100, { $value: h, $type: 'color' }])) } }, null, 2)
}
