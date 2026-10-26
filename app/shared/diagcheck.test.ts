import { describe, expect, it } from 'vitest'
import { detect, fresh, message, parse, touchedBy } from './diagcheck'

describe('diagnostics after edits', () => {
  it('finds the check the project already has', () => {
    const no = () => false
    expect(detect({ scripts: { typecheck: 'tsc -b' } }, no, null)?.label).toBe('npm run typecheck')
    expect(detect({ scripts: {} }, (f) => f === 'tsconfig.json', null)?.args).toContain('--noEmit')
    expect(detect({ scripts: { lint: 'eslint .' } }, no, null)?.label).toBe('npm run lint')
    expect(detect(null, no, '[tool.ruff]\nline-length = 100')?.label).toBe('ruff check')
    expect(detect(null, no, '[tool.mypy]\nstrict = true')?.label).toBe('mypy')
    expect(detect(null, no, null)).toBeNull()
  })
  it('reads tsc, ruff and mypy errors and ignores the rest', () => {
    const out = [
      "src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      'src/b.ts:10:2 - error TS2304: Cannot find name \'foo\'.',
      'app/x.py:4:1: F401 `os` imported but unused',
      'app/y.py:9: error: Incompatible return value type (got "str", expected "int")  [return-value]',
      'src/c.ts(1,1): warning: something',
      'Found 2 errors.',
    ].join('\n')
    const d = parse(out)
    expect(d.map((x) => x.code)).toEqual(['TS2322', 'TS2304', 'F401', 'return-value'])
    expect(d[0]).toMatchObject({ file: 'src/a.ts', line: 3 })
  })
  it('never puts errors from before the turn on the turn, even when lines moved', () => {
    const before = parse("src/old.ts(5,1): error TS2304: Cannot find name 'legacy'.\nsrc/a.ts(2,1): error TS2322: Type 'string' is not assignable to type 'number'.")
    const after = parse([
      "src/old.ts(9,1): error TS2304: Cannot find name 'legacy'.",
      "src/a.ts(2,1): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/a.ts(8,1): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/new.ts(1,1): error TS2307: Cannot find module './gone'.",
    ].join('\n'))
    const f = fresh(before, after)
    expect(f.map((d) => `${d.file}:${d.line}`)).toEqual(['src/a.ts:8', 'src/new.ts:1'])
    expect(fresh(after, after)).toEqual([])
  })
  it('tells Claude the new ones, touched files first', () => {
    const f = parse("src/other.ts(1,1): error TS1: x\n/p/src/mine.ts(2,1): error TS2: y")
    const m = message({ label: 'tsc --noEmit', cmd: 'npx', args: [] }, f, ['/p/src/mine.ts'], '/p')
    expect(m).toContain('2 new errors')
    expect(m.indexOf('src/mine.ts:2')).toBeLessThan(m.indexOf('src/other.ts:1'))
    expect(touchedBy('Edit', { file_path: '/p/a.ts' })).toBe('/p/a.ts')
    expect(touchedBy('Read', { file_path: '/p/a.ts' })).toBeNull()
  })
})
