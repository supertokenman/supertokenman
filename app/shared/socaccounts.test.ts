import { describe, expect, it } from 'vitest'
import { accountId, planMigration, validateProject, vaultKey } from './socaccounts.js'

describe('socaccounts', () => {
  it('key sanitised', () => {
    expect(accountId('X', 'Some.User')).toBe('x:some.user')
    expect(vaultKey('x', 'some.user-1')).toBe('SOCIAL_X_SOME_USER_1')
    expect(vaultKey('linkedin', 'Ana María')).toBe('SOCIAL_LINKEDIN_ANA_MAR_A')
  })

  it('collision suffix', () => {
    const taken = ['SOCIAL_X_ALICE', 'SOCIAL_X_ALICE_2']
    expect(vaultKey('x', 'alice', taken)).toBe('SOCIAL_X_ALICE_3')
    expect(vaultKey('x', 'bob', taken)).toBe('SOCIAL_X_BOB')
  })

  it('migration idempotent', () => {
    const steps = planMigration(['SOCIAL_X', 'SOCIAL_LINKEDIN'], { x: 'Alice' })
    expect(steps).toEqual([
      { op: 'copy', from: 'SOCIAL_X', to: 'SOCIAL_X_ALICE', accountId: 'x:alice' },
      { op: 'delete', key: 'SOCIAL_X' },
      { op: 'copy', from: 'SOCIAL_LINKEDIN', to: 'SOCIAL_LINKEDIN_DEFAULT', accountId: 'linkedin:default' },
      { op: 'delete', key: 'SOCIAL_LINKEDIN' },
    ])
    // Re-running on the post-migration state, or after a copy without its delete, does not duplicate work.
    expect(planMigration(['SOCIAL_X_ALICE', 'SOCIAL_LINKEDIN_DEFAULT'], { x: 'Alice' })).toEqual([])
    expect(planMigration(['SOCIAL_X', 'SOCIAL_X_ALICE'], { x: 'Alice' })).toEqual([{ op: 'delete', key: 'SOCIAL_X' }])
  })

  it('project holds ids only', () => {
    const ok = validateProject({ id: 'p1', name: 'Default', accountIds: ['x:alice'], brandKit: { tone: 'dry' } })
    expect(ok.ok).toBe(true)
    expect(validateProject({ id: 'p1', name: 'D', accountIds: [{ handle: 'alice' }] }).ok).toBe(false)
    expect(validateProject({ id: 'p1', name: 'D', accountIds: ['x:alice'], apiToken: 'abc' }).ok).toBe(false)
    expect(validateProject({ id: 'p1', name: 'D', accountIds: ['x:alice'], brandKit: { note: 'a'.repeat(40) } }).ok).toBe(false)
  })
})
