import { describe, expect, it } from 'vitest'
import { bm25, passagesOf, checkCitations, guard, merge, parsePlan, publishPrompt, score, topPassages, type Item } from './research'

describe('research mode', () => {
  it('refuses profiles of people, takes topics', () => {
    expect(guard('Pix fees for small shops in Brazil')).toBeNull()
    expect(guard('dossier on my new neighbour')).toMatch(/not profiles of people/)
    expect(guard('everything about her before a meeting with Ana')).toMatch(/people/)
    expect(guard('x')).toMatch(/few words/)
  })

  it('reads the plan as JSON or as a numbered list, within breadth', () => {
    expect(parsePlan('Sure: {"questions": ["What are Pix fees?", "What are Pix fees?", "How fast are payouts?", "Who regulates Pix?"]}', 2).questions).toEqual(['What are Pix fees?', 'How fast are payouts?'])
    expect(parsePlan('1. What are fees?\n2) How fast are payouts?\nnoise', 4).questions).toEqual(['What are fees?', 'How fast are payouts?'])
    expect(parsePlan('{"questions": []}', 4).questions).toEqual([])
  })

  it('ranks with BM25 and keeps only the passages that answer', () => {
    const s = bm25('pix fee', ['Pix fee is 0.99% per sale. Pix is instant.', 'Cards take two days.', 'The fee for cards is 1.99%.'])
    expect(s[0]).toBeGreaterThan(s[2]!)
    expect(s[1]).toBe(0)
    const text = `# Intro\nWelcome to our blog about many things.\n\n# Fees\nThe Pix fee is 0.99% per sale.\n\n# Team\nWe like coffee.`
    expect(topPassages('pix fee', text, 2000)).toEqual(['# Fees\nThe Pix fee is 0.99% per sale.'])
  })

  it('cuts a page into passages without its menu, and drops repeats', () => {
    const page = '[Home](/) [Fees](/fees) [Payouts](/payouts)\n# Fees\nPix fee is 0.99% per sale.\nCard fee is 1.99%.\n# Fees\nPix fee is 0.99% per sale.\n[Terms](/t) [Privacy](/p)\nCopyright Acme 2026.'
    // the second Fees block is inside the first, and the copyright line is dropped
    expect(passagesOf(page)).toEqual(['# Fees\nPix fee is 0.99% per sale.\nCard fee is 1.99%.'])
    expect(topPassages('pix fee', page, 2000).join(' ')).not.toContain('[Home]')
  })

  it('keeps a heading with the paragraph under it', () => {
    expect(passagesOf('# Contrato\n\nAluguel de R$ 2.000.\n\nMulta: tres alugueis.')).toEqual(['# Contrato\nAluguel de R$ 2.000.', 'Multa: tres alugueis.'])
  })

  it('merges the same story from several sources and adds engagement', () => {
    const items: Item[] = [
      { kind: 'github', url: 'https://github.com/acme/pixkit', title: 'acme/pixkit: Pix payments toolkit for Node', text: 'Pix toolkit readme', engagement: 900 },
      { kind: 'hn', url: 'https://news.ycombinator.com/item?id=1', title: 'Show HN: Pixkit', text: 'Discussion of https://github.com/acme/pixkit', engagement: 120 },
      { kind: 'web', url: 'https://www.blog.test/pix-fees/', title: 'Pix fees explained for shops', text: 'Pix fee 0.99%' },
      { kind: 'web', url: 'https://blog.test/pix-fees', title: 'Pix fees explained (copy)', text: 'Pix fee 0.99% longer text here' },
    ]
    const m = merge(items)
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ kind: 'github', engagement: 1020 })
    expect(m[0]!.also).toEqual([{ kind: 'hn', url: 'https://news.ycombinator.com/item?id=1' }])
    expect(m[1]!.text).toBe('Pix fee 0.99% longer text here')
  })

  it('scores by relevance, then engagement and freshness, and drops what is off topic', () => {
    const now = Date.parse('2026-10-24')
    const items: Item[] = [
      { kind: 'web', url: 'https://a.test', title: 'Pix fee table', text: 'Pix fee 0.99%', date: '2020-01-01' },
      { kind: 'web', url: 'https://b.test', title: 'Pix fee table', text: 'Pix fee 0.99%', date: '2026-10-01', engagement: 500 },
      { kind: 'web', url: 'https://c.test', title: 'Coffee', text: 'Beans and water' },
    ]
    const s = score('pix fee', items, now)
    expect(s.map((x) => x.url)).toEqual(['https://b.test', 'https://a.test'])
    expect(s[0]!.passages).toEqual(['Pix fee 0.99%'])
  })

  it('checks that every factual sentence cites a real source', () => {
    const r = '# Report\nPix costs 0.99% per sale for most shops, e.g. bakeries [1]. Payouts arrive the next business day [2][3]. Cards are slower than Pix in every single case.\n\n## Gaps\nNo source said how refunds are charged.'
    const c = checkCitations(r, 2)
    expect(c.sentences).toBe(3)
    expect(c.cited).toBe(2)
    expect(c.uncited).toEqual(['Cards are slower than Pix in every single case.'])
    expect(c.unknown).toEqual([3])
    expect(c.used).toEqual([1, 2])
    const p = publishPrompt('Pix', ['fees?'], [{ n: 1, kind: 'web', url: 'https://a.test', title: 'A', passages: ['x', 'y'], also: [] }])
    expect(p).toContain('[1] A (https://a.test)\nx\n…\ny')
  })
})
