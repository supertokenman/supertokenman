import { describe, expect, it } from 'vitest'
import { claimsOf, faithfulness, judgeOf, support } from './faithful'
import type { Source } from './citations'

const src: Source[] = [
  { n: 1, doc: 1, chunk: 1, title: 'Enel', tag: 'bills', text: 'ENEL Fatura de energia. Vencimento: 05/10/2026. Total a pagar: R$ 231,40.' },
  { n: 2, doc: 2, chunk: 2, title: 'Rent', tag: 'bills', text: 'Aluguel de R$ 2.000 por mês, reajuste pelo IGP-M em janeiro.' },
]

describe('faithfulness', () => {
  it('splits claims and skips code and headings', () => {
    expect(claimsOf('## Total\nThe Enel bill total is R$ 231,40 [S1]. Ok.\n```\ncode here is long enough\n```\n- Rent goes up by IGP-M in January [S2]')).toEqual(['The Enel bill total is R$ 231,40 [S1].', 'Rent goes up by IGP-M in January [S2]'])
  })
  it('finds supported, weak, uncited and bad marks', () => {
    const f = faithfulness('The Enel energia total a pagar is R$ 231,40 [S1]. The Enel total is R$ 999,00 [S1]. The aluguel reajuste happens in janeiro [S2]. Payment by Pix gives a discount always. The water bill is due soon [S7].', src)
    expect(f.claims.map((c) => c.verdict)).toEqual(['supported', 'weak', 'supported', 'uncited', 'bad-mark'])
    expect(f.claims[1]!.missingNumbers).toEqual(['999,00'])
    expect(f.coverage).toBeCloseTo(0.8)
    expect(f.supported).toBeCloseTo(0.4)
    expect(f.unused).toEqual([])
  })
  it('scores support by content words', () => {
    expect(support('Total a pagar 231,40', src[0]!.text).score).toBe(1)
    expect(support('Kubernetes cluster autoscaling policies', src[0]!.text).score).toBe(0)
  })
  it('reads the judge', () => {
    expect(judgeOf('UNSUPPORTED.')).toBe('unsupported')
    expect(judgeOf('It is SUPPORTED')).toBe('supported')
    expect(judgeOf('maybe')).toBeNull()
  })
})
