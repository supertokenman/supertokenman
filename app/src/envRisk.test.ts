import { describe, expect, it } from 'vitest'
import type { EnvFile } from '../electron/envScan'
import { repeats, risks } from './envRisk'

const file = (path: string, over: Partial<EnvFile> = {}, keys: [string, string, string][] = [['STRIPE_KEY', 'stripe key', 'h1']]): EnvFile => ({
  path, project: path.split('/').slice(-3, -1).join('/'), template: false, mtime: Date.now(),
  git: { inRepo: true, tracked: false, inHistory: false, ignored: true },
  keys: keys.map(([name, kind, hash]) => ({ name, kind, hash, masked: 'sk_l…9f2a', empty: false })), ...over,
})

describe('env risk', () => {
  it('ranks committed files above unignored ones above stale ones', () => {
    const r = risks([
      file('/u/a/x/.env', { git: { inRepo: true, tracked: false, inHistory: false, ignored: false } }),
      file('/u/a/y/.env', { git: { inRepo: true, tracked: true, inHistory: true, ignored: false } }),
      file('/u/a/z/.env', { mtime: Date.now() - 400 * 86_400_000 }),
      file('/u/a/w/.env', {}, [['PORT', 'setting', 'h9']]),
    ])
    expect(r.map((x) => [x.level, x.project])).toEqual([[0, 'a/y'], [1, 'a/x'], [2, 'a/z']])
    expect(r[1]!.fix).toBe('ignore')
  })
  it('flags real values in templates', () => {
    expect(risks([file('/u/a/x/.env.example', { template: true })])[0]!.level).toBe(1)
    expect(risks([file('/u/a/x/.env.example', { template: true }, [['STRIPE_KEY', 'empty', '']])])).toEqual([])
  })
  it('finds the same value in several projects', () => {
    const g = repeats([file('/u/a/x/.env'), file('/u/a/y/.env.local'), file('/u/a/z/.env', {}, [['OTHER', 'secret', 'h2']])])
    expect(g).toHaveLength(1)
    expect(g[0]!.places.map((p) => p.project)).toEqual(['a/x', 'a/y'])
  })
})
