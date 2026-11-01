import { describe, expect, it } from 'vitest'
import { createPilotRate } from './pilotrate'

const clock = (start = 0) => {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

describe('createPilotRate', () => {
  it('allows a burst of 10 free actions, then refuses', () => {
    const c = clock()
    const r = createPilotRate(c.now)
    for (let i = 0; i < 10; i++) expect(r.take('p1', 'free').ok).toBe(true)
    const over = r.take('p1', 'free')
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.error).toContain('rate limit')
  })
  it('refills at 30 a minute (one token every 2 s)', () => {
    const c = clock()
    const r = createPilotRate(c.now)
    for (let i = 0; i < 10; i++) r.take('p1', 'free')
    expect(r.take('p1', 'free').ok).toBe(false)
    c.advance(2000)
    expect(r.take('p1', 'free').ok).toBe(true)
    expect(r.take('p1', 'free').ok).toBe(false)
  })
  it('charges ask and confirm actions double', () => {
    const c = clock()
    const r = createPilotRate(c.now)
    for (let i = 0; i < 5; i++) expect(r.take('p1', 'ask').ok).toBe(true)
    expect(r.take('p1', 'ask').ok).toBe(false)
    expect(r.take('p1', 'free').ok).toBe(false)
  })
  it('charges confirm double too', () => {
    const c = clock()
    const r = createPilotRate(c.now)
    for (let i = 0; i < 5; i++) expect(r.take('p1', 'confirm').ok).toBe(true)
    expect(r.take('p1', 'confirm').ok).toBe(false)
  })
  it('keeps one bucket per panel', () => {
    const c = clock()
    const r = createPilotRate(c.now)
    for (let i = 0; i < 10; i++) r.take('p1', 'free')
    expect(r.take('p2', 'free').ok).toBe(true)
  })
  it('reports how long to wait', () => {
    const c = clock()
    const r = createPilotRate(c.now)
    for (let i = 0; i < 10; i++) r.take('p1', 'free')
    const over = r.take('p1', 'free')
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.retryAfterMs).toBe(2000)
  })
  it('a dropped panel starts with a full bucket', () => {
    const c = clock()
    const r = createPilotRate(c.now)
    for (let i = 0; i < 10; i++) r.take('p1', 'free')
    r.drop('p1')
    expect(r.take('p1', 'free').ok).toBe(true)
  })
})
