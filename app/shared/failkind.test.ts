import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classify, type LimitWindow } from './failkind'

const NOW = Date.parse('2026-10-30T12:00:00Z')
const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/failover/${name}.txt`, import.meta.url), 'utf8')
const FUTURE = '2026-10-30T17:00:00.000Z'
const none: LimitWindow[] = []

describe('failkind classifier', () => {
  it.each([
    ['plan_window', 'plan_window'],
    ['rate_limit', 'rate_limit'],
    ['overloaded', 'overloaded'],
    ['api_down', 'api_down'],
    ['other_context', 'other'],
    ['near_tool_429', 'other'],
    ['near_prose_overloaded', 'other'],
    ['near_github_403', 'other'],
  ])('fixture %s maps to %s', (name, kind) => {
    expect(classify({ text: fixture(name) }, none, NOW).kind).toBe(kind)
  })

  it('keeps the raw text and parses the plan reset time', () => {
    const f = classify({ text: fixture('plan_window') }, none, NOW)
    expect(f.raw).toBe(fixture('plan_window'))
    expect(f.resetsAt).toBe(new Date(1792679400 * 1000).toISOString())
  })

  it('takes the window and reset from a full live limit when the text has no reset', () => {
    const w: LimitWindow[] = [{ kind: 'five_hour', percentUsed: 100, resetsAt: FUTURE }, { kind: 'seven_day', percentUsed: 40 }]
    expect(classify({ text: fixture('rate_limit'), status: 429 }, w, NOW)).toMatchObject({ kind: 'plan_window', window: 'five_hour', resetsAt: FUTURE })
  })

  it('ignores a live window whose reset has passed', () => {
    const w: LimitWindow[] = [{ kind: 'five_hour', percentUsed: 100, resetsAt: '2026-10-30T11:00:00.000Z' }]
    expect(classify({ text: fixture('rate_limit') }, w, NOW).kind).toBe('rate_limit')
  })

  it('reads the status when there is no text, and treats other 5xx as api_down', () => {
    expect(classify({ status: 529 }, none, NOW).kind).toBe('overloaded')
    expect(classify({ status: 503 }, none, NOW).kind).toBe('api_down')
    expect(classify({ status: 400 }, none, NOW).kind).toBe('other')
  })

  it('maps network errors to api_down and an error subtype to other', () => {
    expect(classify({ text: 'ECONNRESET' }, none, NOW).kind).toBe('api_down')
    expect(classify({ text: 'fetch failed' }, none, NOW).kind).toBe('api_down')
    expect(classify({ text: 'ENOENT' }, none, NOW).kind).toBe('other')
    expect(classify({ subtype: 'error_during_execution', text: '' }, none, NOW).kind).toBe('other')
  })
})
