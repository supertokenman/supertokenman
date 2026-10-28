import { describe, expect, it } from 'vitest'
import { cleanTrigger } from './triggers'
import { cleanPersona } from './personas'
import { fileId, personaToMd, plan, triggerFromMd, triggerToMd } from './projectfiles'

const trig = cleanTrigger({ id: 'morning', name: 'Morning check', persona: 'reviewer', cwd: '/p', prompt: 'Check CI.\n---\n[ask] Fix it.', when: { kind: 'schedule', days: [1, 2, 3, 4, 5], time: '08:40' }, gate: true, scope: { read: ['docs'], write: ['src'], commands: ['npm test'] } })

describe('project files', () => {
  it('round-trips a trigger, and one from a file never starts on its own', () => {
    const back = triggerFromMd(triggerToMd(trig), 'morning', '/p')
    expect({ ...back, enabled: true, armedAt: undefined }).toEqual({ ...trig, enabled: true, armedAt: undefined })
    expect(back.enabled).toBe(false)
    expect(triggerFromMd('---\nname: x\nwhen: every 30\n---\nhi', 'x', '/p').when).toEqual({ kind: 'every', minutes: 30 })
    expect(triggerFromMd('---\nname: x\nwhen: pr-review\n---\nhi', 'x', '/p').when).toEqual({ kind: 'pr-review' })
  })
  it('names files safely', () => {
    expect(fileId('.supertokenman/triggers/Morning Check!.md')).toBe('morning-check-')
  })
  it('plans an import: new, changed and the same', () => {
    const p = cleanPersona({ id: 'reviewer', name: 'Reviewer', instructions: 'Review.' })
    const files = {
      personas: [{ id: 'reviewer', text: personaToMd({ ...p, instructions: 'Review harder.' }) }, { id: 'writer', text: personaToMd(cleanPersona({ name: 'Writer' })) }],
      triggers: [{ id: 'morning', text: triggerToMd(trig) }],
    }
    const r = plan(files, { personas: [p], triggers: [trig] }, '/p')
    expect(r.changes.map((c) => `${c.kind}:${c.id}:${c.what}`)).toEqual(['persona:reviewer:changed', 'persona:writer:new', 'trigger:morning:same'])
  })
})
