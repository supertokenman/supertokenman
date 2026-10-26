import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MemNode } from './memtree'
import { buildIndex, cosine, indexSize, searchIndex } from './vecindex'

// a tiny embedding: one dimension per topic word, so nearness is predictable
const TOPICS = ['database', 'postgres', 'deploy', 'cloudflare', 'design', 'color']
const fakeEmbed = (calls: string[][]) =>
  (async (_u: string, init: { body: string }) => {
    const { input } = JSON.parse(init.body) as { input: string[] }
    calls.push(input)
    return new Response(JSON.stringify({ embeddings: input.map((t) => TOPICS.map((w) => (t.toLowerCase().includes(w) ? 1 : 0.01))) }))
  }) as unknown as typeof fetch

const node = (id: string, title: string, body = ''): MemNode => ({ id, kind: 'decision', date: '', title, summary: '', body, file: '' })

describe('memory meaning index', () => {
  it('embeds entries once, redoes only changed ones, and finds by meaning', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'vec-')), 'p.json')
    const calls: string[][] = []
    const nodes = [node('a', 'Use Postgres for the database'), node('b', 'Deploy on Cloudflare Workers'), node('c', 'Brand color and design tokens')]
    expect(await buildIndex(f, 'nomic', nodes, fakeEmbed(calls))).toEqual({ total: 3, done: 3 })
    expect(await buildIndex(f, 'nomic', nodes, fakeEmbed(calls))).toEqual({ total: 3, done: 0 })
    const changed = [nodes[0]!, node('b', 'Deploy on Cloudflare Workers', 'with wrangler'), nodes[2]!]
    expect((await buildIndex(f, 'nomic', changed, fakeEmbed(calls))).done).toBe(1)
    const hits = await searchIndex(f, 'nomic', changed, 'which postgres database?', 2, fakeEmbed(calls))
    expect(hits[0]!.node.id).toBe('a')
    expect(indexSize(f, 'nomic')).toBe(3)
    expect(indexSize(f, 'other-model')).toBe(0)
  })
  it('measures nearness', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1)
    expect(cosine([1, 0], [0, 1])).toBe(0)
  })
})
