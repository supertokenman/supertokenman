import { describe, expect, it } from 'vitest'
import { canAllow, gitHost, installLabel, lineDiff, money, newer, openUpdate, pctText, toUpdateDecisions, duration } from './logic'

describe('packs logic', () => {
  it('compares versions', () => {
    expect(newer('1.2.0', '1.1.9')).toBe(true)
    expect(newer('1.0.0', '1.0.0')).toBe(false)
    expect(newer('0.9.0', '1.0.0')).toBe(false)
  })
  it('labels a row from the installs', () => {
    const row = { id: 'a', version: '1.1.0', versions: ['1.0.0', '1.1.0'], valid: true }
    expect(installLabel(row, [])).toEqual({ text: 'Not installed', update: null })
    expect(installLabel(row, [{ packId: 'a', version: '1.0.0', previous: null, scope: 'project' }])).toEqual({ text: 'Installed 1.0.0, this project', update: '1.1.0' })
    expect(installLabel(row, [{ packId: 'a', version: '1.1.0', previous: null, scope: 'global' }]).update).toBeNull()
    expect(installLabel(row, [{ packId: 'a', version: '1.1.0', previous: null, scope: 'global' }, { packId: 'a', version: '1.1.0', previous: null, scope: 'project' }]).text).toBe('Installed 1.1.0, here and global')
  })
  it('lists files with no answer yet', () => {
    const v = { conflicts: [{ path: 'a' }], asks: ['b'], newHosts: [] }
    expect(openUpdate(v, {})).toEqual(['a', 'b'])
    expect(openUpdate(v, { a: 'mine', b: 'leave' })).toEqual([])
  })
  it('maps the choices of the screen to the channel decisions', () => {
    expect(toUpdateDecisions({ a: 'theirs', c: 'beside', d: 'mine', b: 'recreate', e: 'leave' }, ['b', 'e'])).toEqual({ a: 'theirs', c: 'beside', d: 'mine', b: 'recreate', e: 'leave' })
  })
  it('blocks Allow on errors and unanswered conflicts', () => {
    expect(canAllow({ errors: ['bad'], conflicts: [], blocked: false }, {}).ok).toBe(false)
    expect(canAllow({ errors: [], conflicts: [{ to: 'x', overwritable: true }], blocked: true }, {}).why).toMatch(/x/)
    expect(canAllow({ errors: [], conflicts: [{ to: 'x', overwritable: true }], blocked: true }, { x: 'skip' }).ok).toBe(true)
  })
  it('diffs by line', () => {
    expect(lineDiff('a\nb\nc', 'a\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ])
    expect(lineDiff('', '')).toEqual([{ kind: 'same', text: '' }])
  })
  it('reads the host of a git address', () => {
    expect(gitHost('https://github.com/a/b')).toBe('github.com')
    expect(gitHost('http://github.com/a/b')).toBeNull()
    expect(gitHost('https://u:p@github.com/a/b')).toBeNull()
    expect(gitHost('nope')).toBeNull()
  })
  it('formats the comparison numbers', () => {
    expect(money(0.004)).toBe('< $0.01')
    expect(money(1.239)).toBe('$1.24')
    expect(duration(75_000)).toBe('1 min 15 s')
    expect(pctText({ abs: -3, pct: -31.2 })).toBe('-31%')
    expect(pctText({ abs: 2, pct: null })).toBe('n/a')
    expect(pctText({ abs: 0, pct: 0 })).toBe('same')
  })
})
