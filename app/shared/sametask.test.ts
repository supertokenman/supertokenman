import { describe, expect, it } from 'vitest'
import { ownerOf, sameTask } from './sametask'

describe('one task, one owner', () => {
  it('knows a request asked again in other words order as the same task', () => {
    expect(sameTask('fix the login redirect on Safari', '@frontend fix the Safari login redirect')).toBe(true)
    expect(sameTask('fix the login redirect', 'write the changelog for the release')).toBe(false)
    expect(sameTask('ok', 'ok')).toBe(false)
  })
  it('finds the busy panel on it, and ignores idle ones', () => {
    const panels = [
      { sid: 's1', busy: false, asking: 'fix the login redirect on Safari' },
      { sid: 's2', busy: true, asking: 'fix the login redirect on Safari' },
    ]
    expect(ownerOf('fix the Safari login redirect', panels)).toBe('s2')
    expect(ownerOf('deploy the worker', panels)).toBeNull()
  })
})
