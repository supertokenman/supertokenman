import { describe, expect, it } from 'vitest'
import { designMd } from './designmd'

const themes = [
  { id: 'l', name: 'Paper', scheme: 'light' as const, c: { bg: '#ffffff', text: '#000000', accent: '#ba5936', onAccent: '#ffffff' } },
  { id: 'd', name: 'Dark', scheme: 'dark' as const, c: { bg: '#000000', text: '#ffffff', accent: '#d97757', onAccent: '#1a0f0a' } },
]
const ratio = (a: string, b: string) => (a === b ? 1 : 21)

describe('DESIGN.md', () => {
  it('lists every token in every theme, with its variable', () => {
    const md = designMd(themes, [{ fg: 'text', bg: 'bg', min: 4.5, use: 'Body text' }], ratio)
    expect(md).toContain('| `onAccent` | `--on-accent` | text on accent | `#ffffff` | `#1a0f0a` |')
    expect(md).toContain('| text on bg | Body text | 4.5:1 | 21.00:1 | 21.00:1 |')
    expect(md.startsWith('# DESIGN.md')).toBe(true)
  })
  it('is the same every time for the same input', () => {
    expect(designMd(themes, [], ratio)).toBe(designMd(themes, [], ratio))
  })
})
