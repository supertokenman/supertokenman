import { describe, expect, it } from 'vitest'
import { runFilter, throughFilters } from './filterbox'
import { acceptable, activeFor, EXAMPLE, headerOf, type MsgFilter } from '../shared/msgfilters'

describe('filter sandbox', () => {
  it('runs an inlet with its valves', async () => {
    expect(await runFilter('function inlet(t, v) { return t.toUpperCase() + v.mark }', 'inlet', 'hi', { mark: '!' })).toEqual({ ok: true, text: 'HI!' })
  })
  it('has no require, process, fetch or eval', async () => {
    for (const body of ['return require("fs")', 'return process.env.HOME', 'return fetch("http://x")', 'return eval("1")', 'return Function("return 1")()']) {
      const r = await runFilter(`function inlet(t) { ${body} }`, 'inlet', 'x', {})
      expect(r.ok).toBe(false)
    }
  })
  it('stops endless loops and refuses non-text answers', async () => {
    expect(await runFilter('function inlet(t) { while (true) {} }', 'inlet', 'x', {})).toMatchObject({ ok: false })
    expect(await runFilter('function inlet(t) { return 42 }', 'inlet', 'x', {})).toMatchObject({ ok: false, error: 'inlet did not return text.' })
  })
  it('runs the example and skips a broken filter in a chain', async () => {
    const trace = 'Error: boom\n' + Array.from({ length: 100 }, (_, i) => `    at f${i} (a.js:${i}:1)`).join('\n') + '\nafter'
    const h = headerOf(EXAMPLE)
    const r = await throughFilters(trace, [{ name: 'broken', code: 'function inlet(t) { throw new Error("nope") }', valves: {} }, { name: h.name, code: EXAMPLE, valves: h.valves }], 'inlet', acceptable)
    expect(r.skipped).toEqual([{ name: 'broken', error: 'nope' }])
    expect(r.ran).toEqual(['Trim long stack traces'])
    expect(r.text).toContain('60 more frames')
    expect(r.text.split('\n').length).toBeLessThan(50)
  })
})

describe('filter list', () => {
  const f = (over: Partial<MsgFilter>): MsgFilter => ({ id: 'a', name: 'a', code: 'function inlet(t) { return t }', valves: {}, on: true, order: 0, projects: [], ...over })
  it('reads the header and picks filters by stage, project and order', () => {
    expect(headerOf(EXAMPLE)).toMatchObject({ name: 'Trim long stack traces', valves: { maxLines: 40 }, stages: ['inlet'] })
    expect(headerOf('// valves: {bad}\nfunction outlet(t){return t}').error).toMatch(/JSON/)
    expect(headerOf('const x = 1').error).toMatch(/Define/)
    const list = [f({ id: 'b', order: 2 }), f({ id: 'c', order: 1, projects: ['/w/acme'] }), f({ id: 'd', on: false }), f({ id: 'e', code: 'function outlet(t){return t}' })]
    expect(activeFor(list, '/w/acme/sub', 'inlet').map((x) => x.id)).toEqual(['c', 'b'])
    expect(activeFor(list, '/w/other', 'inlet').map((x) => x.id)).toEqual(['b'])
    expect(activeFor(list, '/w/other', 'outlet').map((x) => x.id)).toEqual(['e'])
    expect(acceptable('ab', 'x'.repeat(30_000))).toBe(false)
  })
})
