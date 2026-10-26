import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractLocal, folderItems, research, sourceList, type Deps, type ResearchEvent } from './research'

const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })
const fakeFetch = (async (u: string) => {
  if (u.includes('/search?tags=story')) return json({ hits: [{ objectID: '7', title: 'Show HN: Pixkit, Pix payments for Node', url: 'https://github.com/acme/pixkit', points: 80, num_comments: 20, created_at: '2026-09-01T00:00:00Z' }] })
  if (u.includes('/search/repositories')) return json({ items: [{ full_name: 'acme/pixkit', html_url: 'https://github.com/acme/pixkit', description: 'Pix payments for Node with fee tables', topics: ['pix', 'payments'], stargazers_count: 900, pushed_at: '2026-10-01T00:00:00Z', license: { spdx_id: 'MIT' } }] })
  return new Response('no', { status: 404 })
}) as typeof fetch

const deps = (over: Partial<Deps> = {}) => {
  const events: ResearchEvent[] = []
  const asked: string[] = []
  const d: Deps = {
    ask: async (p) => (asked.push(p), p.startsWith('You plan research') ? '{"questions": ["What are Pix fees?", "Which Pix libraries exist for Node?"]}' : 'Pix costs 0.99% per sale at Acme [1]. Pixkit is an MIT library for Node [2].\n\n## Gaps\nNothing on refunds.'),
    search: async () => [{ url: 'https://acme.test/fees', title: 'Fees', snippet: '' }],
    read: async (url) => ({ url, title: 'Acme fees', markdown: '# Fees\nThe Pix fee is 0.99% per sale.\n\n# Careers\nWe are hiring.' }),
    fetch: fakeFetch,
    allow: () => null,
    emit: (e) => events.push(e),
    ...over,
  }
  return { d, events, asked }
}

describe('research pipeline', () => {
  it('plans, reads every source, merges, filters and publishes with citations', async () => {
    const { d, events, asked } = deps()
    const r = await research({ topic: 'Pix payments for small shops', kinds: ['web', 'hn', 'github'] }, d)
    expect(r.stage).toBe('done')
    if (r.stage !== 'done') return
    expect(events[0]).toEqual({ stage: 'plan', questions: ['What are Pix fees?', 'Which Pix libraries exist for Node?'] })
    expect(events.filter((e) => e.stage === 'read')).toHaveLength(6)
    // the HN thread about the repo became part of the repo's source
    const repo = r.sources.find((s) => s.url === 'https://github.com/acme/pixkit')!
    expect(repo.also).toContain('https://news.ycombinator.com/item?id=7')
    expect(r.sources.some((s) => s.url.includes('ycombinator'))).toBe(false)
    // only the passage about fees reached the publisher, not the careers part
    const pub = asked[1]!
    expect(pub).toContain('The Pix fee is 0.99% per sale.')
    expect(pub).not.toContain('hiring')
    expect(r.check).toMatchObject({ sentences: 2, cited: 2, unknown: [] })
    expect(sourceList(r.sources)).toMatch(/## Sources\n1\. \[/)
  })

  it('refuses people, stops at the brake, and survives a source that fails', async () => {
    const a = deps()
    expect(await research({ topic: 'dossier on my landlord', kinds: ['web'] }, a.d)).toMatchObject({ stage: 'stopped', why: expect.stringMatching(/people/) })
    expect(a.asked).toHaveLength(0)
    const b = deps({ allow: (t) => (t > 200 ? `This run would send about ${t} tokens, over today's limit.` : null) })
    expect(await research({ topic: 'Pix payments for small shops', kinds: ['web'] }, b.d)).toMatchObject({ stage: 'stopped', why: expect.stringMatching(/over today's limit/) })
    expect(b.asked).toHaveLength(1)
    const c = deps({ search: async () => { throw new Error('Set a SearXNG address') } })
    const r = await research({ topic: 'Pix payments for small shops', kinds: ['web', 'github'] }, c.d)
    expect(r.stage).toBe('done')
    expect(c.events.find((e) => e.stage === 'read' && e.kind === 'web')).toMatchObject({ found: 0, error: 'Set a SearXNG address' })
  })

  it('researches a local folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rs-'))
    mkdirSync(join(dir, 'notes'))
    mkdirSync(join(dir, 'node_modules'))
    writeFileSync(join(dir, 'notes', 'pix.md'), '# Pix\nOur Pix fee deal is 0.79% per sale.')
    writeFileSync(join(dir, 'node_modules', 'x.md'), 'Pix fee 9%')
    writeFileSync(join(dir, 'logo.png'), 'x')
    expect(folderItems(dir).map((i) => i.title)).toEqual(['notes/pix.md'])
    const { d, asked } = deps()
    const r = await research({ topic: 'Pix fees we pay', kinds: ['folder'], folder: dir }, d)
    expect(r.stage).toBe('done')
    expect(asked[1]).toContain('0.79%')
  })

  it('extracts by schema on the local model', async () => {
    let body: { format?: unknown } = {}
    const f = (async (_u: string, init: RequestInit) => ((body = JSON.parse(String(init.body))), json({ message: { content: '{"plans":[{"name":"Pro","price":49}]}' } }))) as typeof fetch
    const schema = { type: 'object', properties: { plans: { type: 'array' } } }
    expect(await extractLocal('qwen3:4b', 'Pro costs 49', schema, f)).toEqual({ plans: [{ name: 'Pro', price: 49 }] })
    expect(body.format).toEqual(schema)
    const bad = (async () => json({ message: { content: 'sorry' } })) as typeof fetch
    await expect(extractLocal('m', 't', schema, bad)).rejects.toThrow(/JSON/)
  })
})
