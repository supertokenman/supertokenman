import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fuzzyRank, fuzzyScore } from '../shared/fuzzy'
import { cleanPath, gitignoreMatcher, listDir, projectFiles, recentFiles } from './filepick'

let root: string
const put = (rel: string, text = 'x') => {
  mkdirSync(join(root, rel, '..'), { recursive: true })
  writeFileSync(join(root, rel), text)
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stm-fp-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('cleanPath', () => {
  it('takes absolute paths only', () => {
    expect(cleanPath('/a/b/../c/')).toBe('/a/c')
    expect(cleanPath('relative/x')).toBeNull()
    expect(cleanPath('/a\0b')).toBeNull()
    expect(cleanPath(42)).toBeNull()
  })
})

describe('listDir', () => {
  it('lists folders first, hides dotfiles unless asked', async () => {
    put('b.txt', 'hello')
    put('a/x.txt')
    put('.secret')
    const l = await listDir(root)
    expect(l.ok && l.entries.map((e) => [e.name, e.dir])).toEqual([['a', true], ['b.txt', false]])
    expect(l.ok && l.entries[1]!.size).toBe(5)
    const h = await listDir(root, { hidden: true })
    expect(h.ok && h.entries.map((e) => e.name)).toContain('.secret')
  })
  it('caps the listing and reports errors', async () => {
    for (let i = 0; i < 5; i++) put(`f${i}`)
    const l = await listDir(root, { max: 3 })
    expect(l.ok && [l.entries.length, l.truncated]).toEqual([3, true])
    expect(await listDir(join(root, 'nope'))).toEqual({ ok: false, error: 'missing' })
    expect(await listDir('nope')).toEqual({ ok: false, error: 'invalid' })
  })
})

describe('gitignoreMatcher', () => {
  it('handles globs, anchors, folders and negation', () => {
    const m = gitignoreMatcher('# c\n*.log\n/build\ndist/\n!keep.log\ndocs/**/*.tmp\n')
    expect(m('a.log', false)).toBe(true)
    expect(m('sub/a.log', false)).toBe(true)
    expect(m('keep.log', false)).toBe(false)
    expect(m('build', true)).toBe(true)
    expect(m('sub/build', true)).toBe(false)
    expect(m('dist', false)).toBe(false)
    expect(m('sub/dist', true)).toBe(true)
    expect(m('docs/a/b/c.tmp', false)).toBe(true)
    expect(m('src/a.ts', false)).toBe(false)
  })
})

describe('projectFiles', () => {
  const fixture = () => {
    put('.gitignore', 'out/\n*.log\n')
    put('src/a.ts')
    put('src/deep/b.ts')
    put('out/bundle.js')
    put('debug.log')
    put('node_modules/x/index.js')
    put('.env')
    put('pkg/.gitignore', 'gen.ts\n')
    put('pkg/gen.ts')
    put('pkg/main.ts')
  }
  it('walks a plain folder with its .gitignore files', async () => {
    fixture()
    const l = await projectFiles(root, { git: false })
    expect(l.ok && l.entries.map((e) => e.name).sort()).toEqual(['pkg/main.ts', 'src/a.ts', 'src/deep/b.ts'])
  })
  it('uses git in a repository', async () => {
    fixture()
    try {
      execFileSync('git', ['init', '-q', root])
    } catch {
      return
    }
    const l = await projectFiles(root)
    expect(l.ok && l.entries.map((e) => e.name).sort()).toEqual(['pkg/main.ts', 'src/a.ts', 'src/deep/b.ts'])
    const h = await projectFiles(root, { hidden: true })
    expect(h.ok && h.entries.map((e) => e.name)).toContain('.env')
  })
  it('stops at the limit', async () => {
    for (let i = 0; i < 20; i++) put(`d${i % 4}/f${i}.txt`)
    const l = await projectFiles(root, { git: false, max: 7 })
    expect(l.ok && [l.entries.length, l.truncated]).toEqual([7, true])
  })
})

describe('recentFiles', () => {
  it('puts attached files first, then the newest, and names denied folders', async () => {
    put('dl/old.txt')
    put('dl/new.txt')
    put('docs/mid.txt')
    utimesSync(join(root, 'dl/old.txt'), 1000, 1000)
    utimesSync(join(root, 'docs/mid.txt'), 2000, 2000)
    const r = await recentFiles([join(root, 'docs/mid.txt'), 'relative'], [join(root, 'dl'), join(root, 'docs'), join(root, 'gone')], { max: 3 })
    expect(r.entries.map((e) => e.name)).toEqual(['mid.txt', 'new.txt', 'old.txt'])
    expect(r.denied).toEqual([])
  })
})

describe('fuzzy ranking', () => {
  const files = ['src/Panel.tsx', 'src/panel/old.ts', 'docs/plan.md', 'electron/main.ts', 'src/FolderPicker.tsx']
  const rank = (q: string) => fuzzyRank(files, q, (f) => f.split('/').pop()!, (f) => f)
  it('prefers exact and prefix name matches, then path matches', () => {
    expect(rank('panel')[0]).toBe('src/Panel.tsx')
    expect(rank('panel')).toContain('src/panel/old.ts')
    expect(rank('fp')[0]).toBe('src/FolderPicker.tsx')
    expect(rank('electron')).toEqual(['electron/main.ts'])
    expect(rank('zzz')).toEqual([])
    expect(rank('')).toEqual(files)
  })
  it('scores letters in order only', () => {
    expect(fuzzyScore('supertokenman', 'stm')).toBeGreaterThan(0)
    expect(fuzzyScore('supertokenman', 'mts')).toBe(-1)
    expect(fuzzyScore('main.ts', 'main.ts')).toBeGreaterThan(fuzzyScore('main.tsx', 'main.ts'))
  })
})
