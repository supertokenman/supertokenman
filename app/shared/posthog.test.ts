import { describe, expect, it } from 'vitest'
import { chartOf, checkHost, checkQuery, framesOf, matchFile, rolloutOf, sqlOf } from './posthog'

describe('posthog', () => {
  it('checks hosts and queries', () => {
    expect(checkHost('https://us.posthog.com')).toBeNull()
    expect(checkHost('http://127.0.0.1:8000')).toBeNull()
    expect(checkHost('http://posthog.example.com')).toMatch(/https/)
    expect(checkQuery('SELECT 1')).toBeNull()
    expect(checkQuery("select event from events where event = 'drop table'")).toBeNull()
    expect(checkQuery('ALTER TABLE events')).toMatch(/SELECT/)
    expect(checkQuery('SELECT 1; SELECT 2')).toMatch(/One query/)
    expect(sqlOf('Counts signups.\n```sql\nSELECT count() FROM events;\n```')).toBe('SELECT count() FROM events')
  })

  it('charts dates as a line and categories as bars', () => {
    expect(chartOf({ columns: ['day', 'events'], results: [['2026-10-20', 5], ['2026-10-21', '7']] })).toEqual({ kind: 'line', x: ['2026-10-20', '2026-10-21'], y: [5, 7], label: 'events' })
    expect(chartOf({ columns: ['event', 'total'], results: [['$pageview', 90], ['signup', 4]] })!.kind).toBe('bar')
    expect(chartOf({ columns: ['a', 'b'], results: [['x', 'y']] })).toBeNull()
  })

  it('describes a rollout', () => {
    expect(rolloutOf({ id: 1, key: 'a', active: false })).toBe('Off')
    expect(rolloutOf({ id: 1, key: 'a', active: true, filters: { groups: [{ rollout_percentage: 25 }] } })).toBe('On for 25% of users')
    expect(rolloutOf({ id: 1, key: 'a', active: true, filters: { groups: [{ rollout_percentage: null }] } })).toBe('On for everyone')
    expect(rolloutOf({ id: 1, key: 'a', active: true, filters: { groups: [{ properties: [{}] }, { rollout_percentage: 10 }] } })).toBe('On for 2 groups with conditions')
  })

  it('maps exception frames to project files', () => {
    const f = framesOf([{ type: 'TypeError', stacktrace: { frames: [{ filename: 'node_modules/react-dom/x.js', lineno: 9, in_app: false }, { filename: 'webpack://app/./src/cart/total.ts', lineno: 42, function: 'sum' }] } }])
    expect(f[0]).toEqual({ file: 'webpack://app/./src/cart/total.ts', line: 42, fn: 'sum', inApp: true })
    expect(matchFile(f[0]!.file, ['src/cart/total.ts', 'src/total.ts', 'README.md'])).toBe('src/cart/total.ts')
    expect(matchFile('https://cdn.example.com/assets/index-abc.js', ['src/main.ts'])).toBeNull()
  })
})
