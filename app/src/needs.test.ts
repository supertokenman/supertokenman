import { describe, expect, it } from 'vitest'
import { needs, type Inputs } from './needs'
import { initial } from './state'

const base: Inputs = { panels: { order: [], byId: {}, focus: null }, appUnread: {}, appNames: { whatsapp: 'WhatsApp' }, teamUnread: 0, reviews: [], next: null, exposures: 0, renewals: [], newsUnread: 0, now: 1_000_000 }

describe('inbox', () => {
  it('is empty when nothing needs you', () => {
    expect(needs(base)).toEqual([])
  })
  it('ranks a waiting panel and a red CI above messages and news', () => {
    const s = { ...initial, cwd: '/x/engine', asks: [{ id: 'a1', tool: 'Bash', summary: 'rm -rf dist' }], ci: { repo: 'o/r', branch: 'main', runs: [{ id: 9, workflow: 'CI', title: '', branch: 'main', sha: '', event: '', status: 'completed', conclusion: 'failure', createdAt: '', updatedAt: '2026-01-01T00:00:00Z', url: '', attempt: 1 }] } }
    const n = needs({ ...base, panels: { order: ['s1'], byId: { s1: s }, focus: 's1' }, appUnread: { whatsapp: 3 }, newsUnread: 12, next: { title: 'Standup', inMin: 4, join: 'https://meet.google.com/x' } })
    expect(n.map((x) => x.kind)).toEqual(['ci', 'ask', 'meeting', 'message', 'news'])
    expect(n.find((x) => x.kind === 'meeting')!.go).toEqual({ to: 'join', url: 'https://meet.google.com/x' })
  })
  it('flags machines left running', () => {
    const n = needs({ ...base, forgotten: [{ name: 'old-api', provider: 'AWS', days: 290 }] })
    expect(n[0]).toMatchObject({ level: 1, kind: 'cloud', title: 'old-api running for 290 days', go: { to: 'cloud' } })
  })
  it('leaves far meetings and renewals out', () => {
    const n = needs({ ...base, next: { title: 'Later', inMin: 90 }, renewals: [{ name: 'biaze.dev', inDays: 40 }, { name: 'Workers', inDays: 1 }] })
    expect(n.map((x) => x.title)).toEqual(['Workers renews in 1d'])
  })
  it('lists a panel that asked a question or stopped', () => {
    const s = { ...initial, cwd: '/x/engine' }
    const n = needs({ ...base, panels: { order: ['a', 'b'], byId: { a: s, b: { ...s, cwd: '/x/web' } }, focus: null }, runs: { a: { state: 'waiting_input' }, b: { state: 'error', reason: 'disconnected' } } })
    expect(n.map((x) => x.title)).toEqual(['engine asks you something', 'web stopped'])
    expect(n[1]!.detail).toBe('disconnected')
  })
})
