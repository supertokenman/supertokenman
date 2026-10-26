// Phase 92: the contrast each theme must keep, by WCAG 2.2: 4.5 for body text, 3 for large text,
// icons and UI parts (1.4.11). The design system sheet shows this matrix; a test fails a theme under it.
import { contrast, grade } from './colorKit'
import type { Theme } from './themes'

type Key = keyof Theme['c']
export type Rule = { fg: Key; bg: Key; min: number; use: string }

export const RULES: Rule[] = [
  { fg: 'text', bg: 'bg', min: 4.5, use: 'Body text' },
  { fg: 'text', bg: 'surface', min: 4.5, use: 'Text on cards and sheets' },
  { fg: 'text', bg: 'raised', min: 4.5, use: 'Text on raised fields' },
  { fg: 'muted', bg: 'bg', min: 4.5, use: 'Secondary text' },
  { fg: 'muted', bg: 'surface', min: 4.5, use: 'Secondary text on sheets' },
  { fg: 'faint', bg: 'bg', min: 3, use: 'Hints and mono labels (large or bold only)' },
  { fg: 'faint', bg: 'surface', min: 3, use: 'Hints on sheets' },
  { fg: 'onAccent', bg: 'accent', min: 4.5, use: 'Primary button text' },
  { fg: 'accent', bg: 'bg', min: 3, use: 'Accent lines, focus bars, icons' },
  { fg: 'accent', bg: 'surface', min: 3, use: 'Accent on sheets' },
  { fg: 'green', bg: 'surface', min: 3, use: 'Status mark, with its label' },
  { fg: 'red', bg: 'surface', min: 3, use: 'Status mark, with its label' },
  { fg: 'gold', bg: 'surface', min: 3, use: 'Status mark, with its label' },
]

export type Row = Rule & { ratio: number; grade: string; ok: boolean; fgHex: string; bgHex: string }
export const matrix = (t: Pick<Theme, 'c'>): Row[] =>
  RULES.map((r) => {
    const ratio = contrast(t.c[r.fg], t.c[r.bg])
    return { ...r, ratio, grade: grade(ratio), ok: ratio >= r.min, fgHex: t.c[r.fg], bgHex: t.c[r.bg] }
  })

const VAR: Partial<Record<Key, string>> = { bg: '--bg', surface: '--surface', raised: '--raised', text: '--text', muted: '--muted', faint: '--faint', accent: '--accent', onAccent: '--on-accent', green: '--green', red: '--red', gold: '--gold' }
/** The colours actually applied to the page, so a custom or system theme is measured as shown. */
export function appliedColors(read: (cssVar: string) => string): Pick<Theme, 'c'> {
  return { c: Object.fromEntries(Object.entries(VAR).map(([k, v]) => [k, read(v!).trim()])) as Theme['c'] }
}
