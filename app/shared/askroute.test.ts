import { describe, expect, it } from 'vitest'
import { claim } from './askroute'

describe('claim', () => {
  const w = [{ id: 'a1', head: 'From panel api: Panel api asks' }, { id: 'a2', head: 'From panel web: Panel web asks' }]
  it('claims the ask whose message was sent, even edited after the start', () => {
    const r = claim(w, 'From panel web: Panel web asks for help:\n\nwhy?\n\nthanks')
    expect(r?.id).toBe('a2')
    expect(r?.rest.map((x) => x.id)).toEqual(['a1'])
  })
  it('ignores a message the person wrote themselves', () => {
    expect(claim(w, 'fix the build')).toBeNull()
    expect(claim([], 'From panel api: Panel api asks')).toBeNull()
  })
})
