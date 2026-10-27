import { describe, expect, it } from 'vitest'
import { folderList, tilde } from './folderpick'

describe('folderList', () => {
  const recents = ['/Users/a/dev/acme', '/Users/a/code/site/']
  const repos = ['/Users/a/dev/acme', '/Users/a/code/supertokenman', '/Users/a/projects/acme-api']
  it('puts recents first and drops repos already in recents', () => {
    const l = folderList(recents, repos, '')
    expect(l.map((f) => [f.name, f.group])).toEqual([['acme', 'Recent'], ['site', 'Recent'], ['supertokenman', 'Git repositories'], ['acme-api', 'Git repositories']])
  })
  it('filters by name, exact and prefix before path matches', () => {
    expect(folderList(recents, repos, 'acme').map((f) => f.name)).toEqual(['acme', 'acme-api'])
    expect(folderList(recents, repos, 'code').map((f) => f.name)).toEqual(['site', 'supertokenman'])
  })
  it('matches letters in order', () => {
    expect(folderList(recents, repos, 'stm').map((f) => f.name)).toEqual(['supertokenman'])
  })
  it('shows home as ~', () => {
    expect(tilde('/Users/a/dev', '/Users/a')).toBe('~/dev')
    expect(tilde('/Users/ab', '/Users/a')).toBe('/Users/ab')
  })
})
