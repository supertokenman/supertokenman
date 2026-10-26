import { describe, expect, it } from 'vitest'
import { add, archive, chainOf, edit, entitiesOf, now, rrf, search, type MemItem } from './memitems'

describe('add-only memory', () => {
  it('edits become new versions; now shows the latest, history keeps all', () => {
    let l: MemItem[] = add([], 'The project uses `pnpm` workspaces.', 'you', 'acme', 1)
    const first = l[0]!.id
    l = edit(l, first, 'The project moved from pnpm to `bun` workspaces.', 'agent', 2)
    expect(l).toHaveLength(2)
    expect(now(l).map((x) => x.text)).toEqual(['The project moved from pnpm to `bun` workspaces.'])
    expect(chainOf(l, first).map((x) => x.at)).toEqual([1, 2])
    expect(chainOf(l, l[1]!.id).map((x) => x.at)).toEqual([1, 2])
    expect(now(archive(l, l[1]!.id, true))).toEqual([])
  })
  it('finds files, packages and symbols, never people', () => {
    expect(entitiesOf('Fix `parseConfig` in src/config/load.ts after `npm install zod`')).toEqual(expect.arrayContaining(['src/config/load.ts', 'parseconfig', 'zod']))
  })
  it('fuses words, meaning and things, newer first on a tie', () => {
    let l: MemItem[] = []
    l = add(l, 'Tests run with vitest; the slow ones are tagged.', 'you', 'acme', 1)
    l = add(l, 'Rate limits are handled in src/api/client.ts with retries.', 'agent', 'acme', 2)
    l = add(l, 'Deploys go through wrangler to Cloudflare.', 'session', 'acme', 3)
    const vectors = new Map(l.map((x, i) => [x.id, [i === 1 ? 1 : 0, i === 1 ? 0 : 1]]))
    const hits = search(l, 'how do we handle throttling in client.ts', { vectors, qvec: [1, 0], cos: (a, b) => a[0]! * b[0]! + a[1]! * b[1]! })
    expect(hits[0]!.item.text).toMatch(/Rate limits/)
    expect(hits[0]!.via).toEqual(expect.arrayContaining(['meaning', 'things']))
    expect(search(l, 'vitest', { origin: ['agent'] })).toEqual([])
  })
  it('rrf adds reciprocal ranks', () => {
    const s = rrf([['a', 'b'], ['b']], 0)
    expect(s.get('b')).toBeCloseTo(1 / 2 + 1)
  })
})
