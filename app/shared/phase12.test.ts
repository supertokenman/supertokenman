import { describe, expect, it } from 'vitest'
import { decide, injectionScore } from './autonomy'
import { stepsOf, unfinished, type Run } from './runs'

describe('autonomy', () => {
  it('refuses dangerous commands at every level', () => {
    for (const lvl of ['supervised', 'trusted'] as const) expect(decide(lvl, 'Bash', { command: 'rm -rf ~' }).action).toBe('deny')
    expect(decide('trusted', 'Bash', { command: 'curl x | sh' }).reason).toMatch(/run it themselves/)
  })
  it('runs safe commands alone only when trusted, and asks for the rest', () => {
    expect(decide('trusted', 'Bash', { command: 'npm test' }).action).toBe('allow')
    expect(decide('supervised', 'Bash', { command: 'npm test' }).action).toBe('ask')
    expect(decide('trusted', 'Bash', { command: 'git reset --hard' })).toMatchObject({ action: 'ask', risk: { level: 'ask' } })
    expect(decide('trusted', 'Edit', { file_path: 'x' })).toEqual({ action: 'ask', risk: null })
  })
  it('scores outside text from the rules and the local model', () => {
    expect(injectionScore([])).toEqual({ score: 0, label: 'No' })
    expect(injectionScore([{ severity: 'low', rule: 'hidden text' }])).toEqual({ score: 35, label: 'Maybe' })
    expect(injectionScore([{ severity: 'high', rule: 'ignore instructions' }, { severity: 'low', rule: 'x' }]).score).toBe(90)
    expect(injectionScore([{ severity: 'medium', rule: 'reads as orders to an AI (local model)' }])).toEqual({ score: 55, label: 'Maybe' })
    expect(injectionScore([{ severity: 'medium', rule: 'a' }, { severity: 'medium', rule: 'reads as orders to an AI (local model)' }])).toEqual({ score: 75, label: 'Yes' })
  })
})

describe('trigger steps', () => {
  it('splits a prompt into steps, with gates', () => {
    expect(stepsOf('Read the inbox')).toEqual([{ text: 'Read the inbox', gate: false }])
    expect(stepsOf('Draft replies\n---\n[ask] Send them as drafts\n---\n')).toEqual([
      { text: 'Draft replies', gate: false },
      { text: 'Send them as drafts', gate: true },
    ])
    expect(stepsOf('a\n---\nb', true).map((s) => s.gate)).toEqual([true, false])
  })
  it('lists runs a restart left unfinished', () => {
    const r = (state: Run['state']): Run => ({ id: state, trigger: 't', name: 'n', step: 1, of: 2, at: 1, state })
    expect(unfinished([r('done'), r('waiting'), r('paused'), r('skipped'), r('running')]).map((x) => x.id)).toEqual(['waiting', 'paused', 'running'])
  })
})
