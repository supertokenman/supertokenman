import { describe, expect, it } from 'vitest'
import { parseMentions, route, type RoutePost } from './chanroute.js'

const post = (over: Partial<RoutePost> = {}): RoutePost => ({ id: 'p1', from: 'api', text: '', mentions: ['web'], depth: 0, ...over })
const ok = { sendLeft: 10 }

describe('parseMentions', () => {
  const panels = ['api', 'web', 'web.v2']
  it('finds known panels once, in order, and ignores unknown names and emails', () => {
    expect(parseMentions('@web and @api, @web again, @nobody, me@api', panels)).toEqual(['web', 'api'])
  })
  it('strips a sentence-ending period and keeps dotted names', () => {
    expect(parseMentions('ask @web.', panels)).toEqual(['web'])
    expect(parseMentions('ask @web.v2 now', panels)).toEqual(['web.v2'])
  })
})

describe('route', () => {
  it('queues a wake over an unauto link', () => {
    expect(route(post(), [{ a: 'api', b: 'web' }], [], ok)).toEqual([{ post: 'p1', to: 'web', delivery: 'queued' }])
  })
  it('matches the link in either direction', () => {
    expect(route(post({ from: 'web', mentions: ['api'] }), [{ a: 'api', b: 'web', auto: true }], [], ok)[0]!.delivery).toBe('auto')
  })
  it('sends auto when within limits and consumes one send', () => {
    const r = route(post({ mentions: ['web', 'x'] }), [{ a: 'api', b: 'web', auto: true }, { a: 'api', b: 'x', auto: true }], [], { sendLeft: 1 })
    expect(r.map((w) => w.delivery)).toEqual(['auto', 'queued'])
  })
  it('downgrades auto to queued when the send limit is spent', () => {
    const r = route(post(), [{ a: 'api', b: 'web', auto: true }], [], { sendLeft: 0 })
    expect(r[0]).toMatchObject({ delivery: 'queued', why: expect.stringContaining('Send limit') })
  })
  it('downgrades auto to queued when the link cap is reached', () => {
    const r = route(post(), [{ a: 'api', b: 'web', auto: true, capUsd: 1, spent: { usd: 1 } }], [], ok)
    expect(r[0]).toMatchObject({ delivery: 'queued', why: expect.stringContaining('Link cap') })
    expect(route(post(), [{ a: 'api', b: 'web', auto: true, capUsd: 1, spent: { usd: 0.5 } }], [], ok)[0]!.delivery).toBe('auto')
  })
  it('refuses an unlinked panel', () => {
    expect(route(post(), [], [], ok)[0]).toMatchObject({ delivery: 'refused', to: 'web' })
  })
  it('ignores a self-mention', () => {
    expect(route(post({ mentions: ['api'] }), [{ a: 'api', b: 'api' }], [], ok)).toEqual([])
  })
  it('refuses at depth above the cap and allows depth equal to it', () => {
    expect(route(post({ depth: 2 }), [{ a: 'api', b: 'web' }], [], ok)[0]!.delivery).toBe('queued')
    expect(route(post({ depth: 3 }), [{ a: 'api', b: 'web' }], [], ok)[0]).toMatchObject({ delivery: 'refused' })
  })
  it('refuses when the target already has 3 open wakes', () => {
    const open = [1, 2, 3].map(() => ({ from: 'x', to: 'web' }))
    expect(route(post(), [{ a: 'api', b: 'web' }], open, ok)[0]).toMatchObject({ delivery: 'refused', why: expect.stringContaining('3 open') })
    expect(route(post(), [{ a: 'api', b: 'web' }], open.slice(1), ok)[0]!.delivery).toBe('queued')
  })
  it('refuses an auto wake that would close a loop', () => {
    const open = [{ from: 'web', to: 'api' }]
    expect(route(post({ from: 'api', mentions: ['web'] }), [{ a: 'api', b: 'web', auto: true }], open, ok)[0]).toMatchObject({ delivery: 'refused' })
  })
  it('queues the person\'s posts even over an auto link', () => {
    expect(route(post({ from: 'you', depth: 0 }), [{ a: 'api', b: 'web', auto: true }], [], ok)[0]!.delivery).toBe('queued')
  })
  it('does not spend a send on a queued wake', () => {
    const r = route(post({ mentions: ['web', 'x'] }), [{ a: 'api', b: 'web' }, { a: 'api', b: 'x', auto: true }], [], { sendLeft: 1 })
    expect(r.map((w) => w.delivery)).toEqual(['queued', 'auto'])
  })
})
