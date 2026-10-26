import { describe, expect, it } from 'vitest'
import { CHECKLIST } from './archdesk'
import { PATTERNS, patternsFor, patternsOfArea } from './patterns'

describe('pattern cards', () => {
  it('every card has a source and fits a checklist area', () => {
    const areas = new Set(CHECKLIST.map((c) => c.area))
    for (const c of PATTERNS) {
      expect(c.read.length, c.id).toBeGreaterThan(0)
      expect(c.read.every((r) => r.url.startsWith('https://')), c.id).toBe(true)
      expect(areas.has(c.area), `${c.id}: ${c.area}`).toBe(true)
      expect(c.when && c.cost && c.trap).toBeTruthy()
    }
  })
  it('finds cards from what a decision is about', () => {
    expect(patternsFor('# 3. Use a queue for outgoing email\nRetries with backoff; jobs may run twice.').map((c) => c.id)).toEqual(['queue', 'idempotency', 'circuit-breaker'])
    expect(patternsFor('Put Redis in front of the product reads with a short TTL')[0]!.id).toBe('cache-aside')
    expect(patternsFor('Rename the settings screen')).toEqual([])
  })
  it('groups by area', () => expect(patternsOfArea('Scaling reads').map((c) => c.id)).toEqual(['cache-aside', 'read-replicas', 'cdn']))
})
