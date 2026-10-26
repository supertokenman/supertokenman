import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIN_BYTES, rereads } from './reread'

const dir = () => {
  const d = mkdtempSync(join(tmpdir(), 'reread-'))
  writeFileSync(join(d, 'big.ts'), 'x'.repeat(MIN_BYTES + 10))
  writeFileSync(join(d, 'tiny.ts'), 'x')
  return d
}

describe('rereads', () => {
  it('turns aside the same read of an unchanged file once', () => {
    const r = rereads(dir())
    expect(r.check({ file_path: 'big.ts' })).toBeNull()
    expect(r.check({ file_path: 'big.ts' })).toMatchObject({ bytes: MIN_BYTES + 10 })
    expect(r.check({ file_path: 'big.ts' })).toBeNull()
    // asked for again: nothing was saved
    expect(r.settle()).toBe(0)
  })
  it('counts what stayed turned aside when the turn ends', () => {
    const r = rereads(dir())
    r.check({ file_path: 'big.ts' })
    r.check({ file_path: 'big.ts' })
    expect(r.settle()).toBe(MIN_BYTES + 10)
    expect(r.settle()).toBe(0)
  })
  it('lets a changed file, another range, a tiny file and a missing one through', () => {
    const d = dir()
    const r = rereads(d)
    r.check({ file_path: 'big.ts' })
    expect(r.check({ file_path: 'big.ts', offset: 1, limit: 5 })).toBeNull()
    writeFileSync(join(d, 'big.ts'), 'y'.repeat(MIN_BYTES + 10))
    expect(r.check({ file_path: 'big.ts' })).toBeNull()
    r.check({ file_path: 'tiny.ts' })
    expect(r.check({ file_path: 'tiny.ts' })).toBeNull()
    expect(r.check({ file_path: 'nope.ts' })).toBeNull()
  })
  it('starts over after compaction', () => {
    const r = rereads(dir())
    r.check({ file_path: 'big.ts' })
    r.reset()
    expect(r.check({ file_path: 'big.ts' })).toBeNull()
  })
})
