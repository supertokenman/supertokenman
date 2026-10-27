import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findRepos, repoRoots } from './repos'

const tree = () => {
  const home = mkdtempSync(join(tmpdir(), 'stm-repos-'))
  for (const d of ['dev/acme/.git', 'dev/acme/packages/inner/.git', 'code/a/b/c/deep/.git', 'code/one/.git', 'node_modules/x/.git', 'Library/y/.git', '.Trash/z/.git', 'notes/plain']) mkdirSync(join(home, d), { recursive: true })
  return home
}

describe('findRepos', () => {
  it('finds repos under the roots, skipping heavy folders and nested repos', async () => {
    const home = tree()
    const r = await findRepos(repoRoots(home), { depth: 3 })
    const names = r.map((x) => x.path.slice(home.length + 1)).sort()
    expect(names).toEqual(['code/one', 'dev/acme'])
  })
  it('respects the depth limit', async () => {
    const home = tree()
    const r = await findRepos([home], { depth: 5 })
    expect(r.map((x) => x.name)).toContain('deep')
  })
  it('lists each repo once even when roots overlap', async () => {
    const home = tree()
    const r = await findRepos([home, join(home, 'dev')], { depth: 3 })
    expect(r.filter((x) => x.name === 'acme')).toHaveLength(1)
  })
  it('stops at the limit and survives missing roots', async () => {
    const home = tree()
    expect(await findRepos([join(home, 'nope'), home], { depth: 3, limit: 1 })).toHaveLength(1)
  })
})
