import { describe, expect, it } from 'vitest'
import { asJson, chunks, estimate, ground, locate, merge, type FieldSpec } from './extract'

const fields: FieldSpec[] = [{ name: 'error', description: 'error message', many: true }, { name: 'version', description: 'app version' }]
const log = 'boot ok\nversion 2.4.1 starting\nERROR  db timeout after 30s\nretry\nERROR disk full\n'

describe('locate', () => {
  it('finds exact quotes and tolerates spacing', () => {
    expect(locate(log, 'version 2.4.1')).toEqual({ start: 8, end: 21 })
    const s = locate(log, 'ERROR db timeout')!
    expect(log.slice(s.start, s.end)).toBe('ERROR  db timeout')
    expect(locate(log, 'kernel panic')).toBeNull()
    expect(locate(log, '  ')).toBeNull()
  })
})

describe('ground', () => {
  it('keeps real quotes, rejects invented ones and unknown fields', () => {
    const answer = 'Sure: {"items":[{"field":"version","value":"2.4.1","quote":"version 2.4.1"},{"field":"error","value":"db timeout","quote":"ERROR db timeout"},{"field":"error","value":"oom","quote":"ERROR out of memory"},{"field":"user","value":"x","quote":"boot ok"}]}'
    const r = ground(answer, { offset: 100, text: log }, fields)
    expect(r[0]).toMatchObject({ field: 'version', span: { start: 108, end: 121 } })
    expect(r[1]!.span).not.toBeNull()
    expect(r[2]).toMatchObject({ span: null, why: 'The quote is not in the text.' })
    expect(r[3]).toMatchObject({ span: null, why: 'Not one of the fields asked for.' })
  })
  it('flags an answer that is not JSON', () => {
    expect(ground('no idea', { offset: 0, text: log }, fields)[0]!.why).toMatch(/JSON/)
  })
})

describe('chunks and merge', () => {
  it('cuts long text with offsets that point back into it', () => {
    const text = Array.from({ length: 400 }, (_, i) => `line ${i} ${'x'.repeat(40)}`).join('\n')
    const c = chunks(text, 2000, 100)
    expect(c.length).toBeGreaterThan(5)
    for (const p of c) expect(text.slice(p.offset, p.offset + p.text.length)).toBe(p.text)
    expect(c.at(-1)!.offset + c.at(-1)!.text.length).toBe(text.length)
  })
  it('drops duplicates from overlaps and sorts by position', () => {
    const a = { field: 'e', value: 'v', quote: 'q', span: { start: 50, end: 51 } }
    const b = { field: 'e', value: 'w', quote: 'q2', span: { start: 10, end: 12 } }
    const bad = { field: 'e', value: 'z', quote: 'nope', span: null }
    expect(merge([a, bad, a, b]).map((x) => x.value)).toEqual(['w', 'v', 'z'])
    expect(JSON.parse(asJson([a, bad]))).toEqual([{ field: 'e', value: 'v', quote: 'q', start: 50, end: 51 }])
  })
  it('estimates before running', () => {
    expect(estimate('a'.repeat(30_000), fields).chunks).toBe(3)
  })
})
