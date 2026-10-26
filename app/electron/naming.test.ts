import { describe, expect, it } from 'vitest'
import { checkName, handleLinks, parseResearch, slug, trademarkLinks } from './naming'

describe('naming', () => {
  it('spells names as domains and packages do', () => {
    expect(slug('Bia & Zé Corrida!')).toBe('bia-ze-corrida')
    expect(slug('  ')).toBe('')
  })
  it('reads 404 as free, 200 as taken, the rest as unknown', async () => {
    const f = async (url: string) => ({
      status: url.includes('.com.br') ? 403 : url.includes('rdap.org/domain/acme.com') ? 200 : url.includes('search') ? 200 : 404,
      json: async () => ({ total_count: 3 }),
    })
    const r = await checkName('Acme', f)
    const by = Object.fromEntries(r.map((c) => [c.label, c.verdict]))
    expect(by['acme.com']).toBe('taken')
    expect(by['acme.dev']).toBe('free')
    expect(by['acme.com.br']).toBe('unknown')
    expect(r.find((c) => c.kind === 'github')?.note).toBe('3 repos with this in the name')
    await expect(checkName('!!!', f)).rejects.toThrow()
  })
  it('treats a failed lookup as unknown, never free', async () => {
    const r = await checkName('x', async () => {
      throw new Error('offline')
    })
    expect(r.every((c) => c.verdict === 'unknown')).toBe(true)
  })
  it('links trademark and handle searches', () => {
    expect(trademarkLinks('Bia Zé')[1]!.url).toContain('query=Bia%20Z%C3%A9')
    expect(handleLinks('Bia Zé')[0]!.url).toBe('https://www.instagram.com/biaze/')
  })
  it('parses research wrapped in a fence', () => {
    const r = parseResearch('```json\n{"summary":"s","audience":[{"who":"runners","pain":"injury"}],"competitors":[],"positioning":"p","names":["a"],"risks":[]}\n```')
    expect(r.audience[0]!.who).toBe('runners')
  })
  it.runIf(process.env.STM_NET)('asks the real registries', async () => {
    const r = await checkName('react')
    expect(r.find((c) => c.kind === 'npm')?.verdict).toBe('taken')
  }, 30_000)
})
