import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hexes, overCeiling } from './hexlint'

// colours on purpose: theme palettes, brand marks of other products, the terminal's ANSI palette,
// generated studio art. These numbers may only go down.
const CEILINGS: Record<string, number> = {
  'src/app.css': 139,
  'src/IntegrationMark.tsx': 64,
  'src/TermView.tsx': 41,
  'src/Studio.tsx': 7,
  'src/Mail.tsx': 6,
  'src/PreviewView.tsx': 4,
  'src/Team.tsx': 1,
  'src/Appearance.tsx': 1,
}

describe('hex lint', () => {
  it('finds hex colours and skips comments, ids and entities', () => {
    expect(hexes('a { color: #fff; background: #1f1e1b80 } /* #000 */')).toEqual(['#fff', '#1f1e1b80'])
    expect(hexes("const x = '#c15f3c' // #abc")).toEqual(["#c15f3c"])
    expect(hexes('&#xa; href="#top" PR #12')).toEqual([])
  })
  it('a screen with a hard-coded colour fails', () => {
    expect(overCeiling([{ file: 'src/New.tsx', text: '<div style={{ color: "#ff0000" }} />' }], CEILINGS)).toEqual([{ file: 'src/New.tsx', found: 1, ceiling: 0 }])
  })
  it('the app stays within its ceilings', () => {
    const root = join(__dirname, '..')
    const files = readdirSync(join(root, 'src')).filter((f) => /\.(css|tsx)$/.test(f) && !/\.test\./.test(f)).map((f) => ({ file: `src/${f}`, text: readFileSync(join(root, 'src', f), 'utf8') }))
    expect(overCeiling(files, CEILINGS)).toEqual([])
  })
})
