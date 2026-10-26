import { describe, expect, it } from 'vitest'
import { compiledMd, outlineOf } from './compiledoc'

describe('compiled document', () => {
  it('builds an outline from headings and keeps chunks under them', () => {
    const o = outlineOf([
      { id: 1, text: '# Rental contract\nBetween A and B.' },
      { id: 2, text: 'More terms here.' },
      { id: 3, text: '## Payment\nR$ 2.000 a month.' },
      { id: 4, text: '2.1. Readjustment by IGP-M\nEvery January.' },
    ])
    expect(o.map((n) => [n.title, n.depth, n.chunks])).toEqual([['Rental contract', 1, [1, 2]], ['Payment', 2, [3]], ['Readjustment by IGP-M', 2, [4]]])
  })
  it('falls back to the first line when there are no headings', () => {
    expect(outlineOf([{ id: 9, text: 'Invoice from Enel\nTotal 231,40' }])[0]).toEqual({ title: 'Invoice from Enel', depth: 1, chunks: [9] })
  })
  it('writes the artifact with pointers to chunks', () => {
    const md = compiledMd('Contract', [{ title: 'Payment', depth: 1, chunks: [3, 4] }], 'Rent is R$ 2.000.', 2)
    expect(md).toContain('# Contract (compiled, version 2)')
    expect(md).toContain('- Payment [chunks 3, 4]')
    expect(md).toContain('## Summary')
  })
})
