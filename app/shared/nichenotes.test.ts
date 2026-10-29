import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { medianViews, parseCsv, parseJson, parsePasted, summarize } from './nichenotes.js'

const SOURCE = readFileSync(new URL('./nichenotes.ts', import.meta.url), 'utf8')

describe('pasted text', () => {
  it('one caption per non-empty line, formats detected', () => {
    const rows = parsePasted('Choice A or B?\n\nWhen he/she sleeps\nFacts: 3 cats\nplain line')
    expect(rows.map((r) => r.format)).toEqual(['choice', 'when', 'facts', null])
  })

  it('url kept as label', () => {
    const rows = parsePasted('Facts: cats https://example.com/post?id=1 are great')
    expect(rows[0]?.links).toEqual(['https://example.com/post?id=1'])
    expect(rows[0]?.caption).toContain('https://example.com/post?id=1')
    expect(rows[0]?.views).toBeUndefined()
  })
})

describe('csv', () => {
  it('reads caption, date and views with quoted commas', () => {
    const rows = parseCsv('caption,date,views\n"Choice A or B?",2026-01-02,120\n"Facts: x, y",2026-01-03,80\n')
    expect(rows).toHaveLength(2)
    expect(rows[1]?.caption).toBe('Facts: x, y')
    expect(rows[1]?.format).toBe('facts')
    expect(rows[0]?.views).toBe(120)
    expect(rows[0]?.date).toBe('2026-01-02')
  })

  it('needs a caption column', () => {
    expect(() => parseCsv('text,views\nhi,1')).toThrow(/caption/)
  })
})

describe('json', () => {
  it('accepts strings and objects; ignores bad views', () => {
    const rows = parseJson(JSON.stringify(['When he/she cooks', { caption: 'Facts: a', views: 10 }, { caption: 'x', views: 'n/a' }]))
    expect(rows.map((r) => r.format)).toEqual(['when', 'facts', null])
    expect(rows[1]?.views).toBe(10)
    expect(rows[2]?.views).toBeUndefined()
  })

  it('rejects a non-array', () => {
    expect(() => parseJson('{"caption":"x"}')).toThrow()
  })
})

describe('counts and median', () => {
  it('counts captions per format', () => {
    const s = summarize(parsePasted('Choice A or B?\nChoice C or D?\nFacts: z\nnothing'))
    expect(s.total).toBe(4)
    expect(s.counts).toEqual({ choice: 2, when: 0, facts: 1, sendto: 0, none: 1 })
  })

  it('median of given views, odd and even counts', () => {
    expect(medianViews(parseJson('[{"caption":"a","views":5},{"caption":"b","views":1},{"caption":"c","views":9}]'))).toEqual({ kind: 'median', value: 5 })
    expect(medianViews(parseJson('[{"caption":"a","views":1},{"caption":"b","views":3}]'))).toEqual({ kind: 'median', value: 2 })
  })

  it('no views given returns no-views, not a number', () => {
    const s = summarize(parsePasted('Facts: a\nFacts: b'))
    expect(s.median).toEqual({ kind: 'no-views' })
  })

  it('summary carries the import notice', () => {
    expect(summarize([]).notice).toBe('Numbers are from your import, not measured by the app.')
  })
})

describe('no fetch', () => {
  it('source has no fetch call and no http or https import', () => {
    expect(SOURCE).not.toMatch(/\bfetch\b/)
    expect(SOURCE).not.toMatch(/from\s+['"](node:)?https?['"]/)
    expect(SOURCE).not.toMatch(/import\s*\(\s*['"](node:)?https?['"]/)
    expect(SOURCE).not.toMatch(/require\(/)
  })
})
