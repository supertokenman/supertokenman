import { describe, expect, it } from 'vitest'
import { cleanPersona } from './personas'
import { cleanTrigger } from './triggers'
import { applyTeam, diffTeam, exportTeam, readTeam, type Current } from './team'

const cur: Current = {
  personas: [cleanPersona({ id: 'reviewer', name: 'Reviewer', instructions: 'Review code.' }), cleanPersona({ id: 'ops', name: 'Ops', instructions: 'Deploy with key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ' })],
  triggers: [cleanTrigger({ id: 'morning', name: 'Morning', cwd: '/Users/me/app', prompt: 'Check CI', lastRun: 5, enabled: true })],
  evals: { reviewer: 'Review this | must: security' },
  styles: ['lean'],
  budget: { panelUsd: 2 },
}

describe('team files', () => {
  it('exports without secrets or machine paths, and names what it left out', () => {
    const { team, dropped } = exportTeam('Shop', cur, new Date('2026-10-24T12:00:00Z'))
    expect(team.personas.map((p) => p.id)).toEqual(['reviewer'])
    expect(dropped).toEqual(['persona Ops (Anthropic API key)'])
    expect(team.triggers[0]).toMatchObject({ cwd: '', enabled: false, lastRun: undefined })
    expect(JSON.stringify(team)).not.toContain('sk-ant')
    expect(readTeam(JSON.stringify(team)).personas[0]!.instructions).toBe('Review code.')
  })
  it('refuses what is not a team file', () => {
    expect(() => readTeam('nope')).toThrow(/not JSON/)
    expect(() => readTeam('{"kind":"x"}')).toThrow(/Not a SuperTokenMan team file/)
    expect(() => readTeam('{"kind":"supertokenman-team","version":2}')).toThrow(/version 2/)
  })
  it('shows what is new, changed or the same, and imports only what was picked', () => {
    const theirs = readTeam(JSON.stringify({
      kind: 'supertokenman-team', version: 1, name: 'Shop',
      personas: [{ id: 'reviewer', name: 'Reviewer', instructions: 'Review code. Security first.' }, { id: 'writer', name: 'Writer', instructions: 'Write docs.' }],
      triggers: [{ id: 'morning', name: 'Morning', prompt: 'Check CI', when: { kind: 'schedule', days: [1, 2, 3, 4, 5], time: '09:00' } }],
      evals: { reviewer: 'Review this | must: security' },
      styles: ['action'],
      budget: { panelUsd: 5 },
    }))
    const d = diffTeam(cur, theirs)
    expect(d.map((c) => [c.key, c.status])).toEqual([['persona:reviewer', 'changed'], ['persona:writer', 'new'], ['trigger:morning', 'same'], ['evals:reviewer', 'same'], ['styles', 'changed'], ['budget', 'changed']])
    const next = applyTeam(cur, theirs, ['persona:writer', 'trigger:morning'])
    expect(next.personas.map((p) => [p.id, p.instructions])).toEqual([['reviewer', 'Review code.'], ['ops', cur.personas[1]!.instructions], ['writer', 'Write docs.']])
    expect(next.triggers[0]).toMatchObject({ cwd: '/Users/me/app', enabled: false })
    expect(next.styles).toEqual(['lean'])
    expect(next.budget).toEqual({ panelUsd: 2 })
  })
})
