import { describe, expect, it } from 'vitest'
import { draftConstitution, parseTasks, specSlug, stageMessage, taskMessage } from './spec'

describe('spec first', () => {
  it('names a spec folder from its request', () => {
    expect(specSlug('Página de configurações responsiva!')).toBe('pagina-de-configuracoes-responsiva')
    expect(specSlug('')).toBe('spec')
  })
  it('asks each stage to write its file and stop', () => {
    const s = stageMessage('spec', 'checkout', 'Add Pix to the checkout')
    expect(s).toContain('docs/specs/checkout/spec.md')
    expect(s).toContain('Add Pix to the checkout')
    expect(s).toMatch(/at most 5 questions/)
    expect(s).toMatch(/Stop there and wait/)
    expect(stageMessage('plan', 'checkout')).toContain('docs/specs/checkout/plan.md')
    expect(stageMessage('tasks', 'checkout', '', ['frontend', 'devops'])).toContain('frontend, devops')
  })
  it('reads a task checklist with ids, personas and ticks', () => {
    const md = `# Tasks

- [ ] T1 [frontend] Add the Pix option to the form
- [x] T2 [devops] Add the PIX_KEY secret to the worker
* [ ] **T3**: [qa] Test the paid and expired cases
- [ ] Write the release note
- not a task`
    expect(parseTasks(md)).toEqual([
      { id: 'T1', done: false, persona: 'frontend', text: 'Add the Pix option to the form', line: 3 },
      { id: 'T2', done: true, persona: 'devops', text: 'Add the PIX_KEY secret to the worker', line: 4 },
      { id: 'T3', done: false, persona: 'qa', text: 'Test the paid and expired cases', line: 5 },
      { id: 'T4', done: false, persona: undefined, text: 'Write the release note', line: 6 },
    ])
  })
  it('sends a task with where to read its context', () => {
    const m = taskMessage('checkout', { id: 'T1', done: false, text: 'Add the Pix option', line: 1 })
    expect(m).toContain('docs/specs/checkout/spec.md')
    expect(m).toContain('tick T1')
  })
  it('drafts a constitution with the decisions taken', () => {
    expect(draftConstitution('app', ['use pnpm (lockfile)'])).toContain('- use pnpm (lockfile)')
  })
})
