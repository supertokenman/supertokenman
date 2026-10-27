import { describe, expect, it } from 'vitest'
import { count } from './plural'

describe('count', () => {
  it('uses the singular for one and the plural otherwise', () => {
    expect(count(1, 'turn')).toBe('1 turn')
    expect(count(0, 'turn')).toBe('0 turns')
    expect(count(1204, 'file')).toBe('1,204 files')
    expect(count(2, 'data store', 'data stores')).toBe('2 data stores')
  })
})
