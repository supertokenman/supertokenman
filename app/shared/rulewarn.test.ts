import { describe, expect, it } from 'vitest'
import { parseRules } from './policyrules'
import { broadAllows } from './rulewarn'

const warn = (text: string) => broadAllows(parseRules(text).rules).map((w) => w.line)

describe('broadAllows', () => {
  it('warns on allow *, bare allow Bash, allow write outside the project and bare allow network', () => {
    expect(warn('allow *\nallow Bash\nallow write\nallow network')).toEqual([1, 2, 3, 4])
  })
  it('accepts narrow allows', () => {
    expect(warn('allow read when path inside $project\nallow write when path inside $project\nallow Bash when cmd matches "npm test*"')).toEqual([])
    expect(warn('allow network when host is "registry.npmjs.org"')).toEqual([])
  })
  it('never warns on deny and ask', () => {
    expect(warn('deny *\nask Bash\nask write')).toEqual([])
  })
  it('warns on a write allow whose path condition is not the project', () => {
    expect(warn('allow Write when path inside $home')).toEqual([1])
  })
})
