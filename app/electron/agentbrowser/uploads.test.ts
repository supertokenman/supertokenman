import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkUpload } from './uploads'

describe('upload path check', () => {
  const root = mkdtempSync(join(tmpdir(), 'up-'))
  const out = mkdtempSync(join(tmpdir(), 'out-'))
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'docs', 'a.txt'), 'hello')
  writeFileSync(join(out, 'secret.txt'), 'x')
  symlinkSync(join(out, 'secret.txt'), join(root, 'link.txt'))
  it('accepts a file inside the project, relative or absolute', () => {
    expect(checkUpload(root, 'docs/a.txt')).toMatchObject({ ok: true, size: 5 })
    expect(checkUpload(root, join(root, 'docs', 'a.txt'))).toMatchObject({ ok: true })
  })
  it('refuses a file outside, a link out, a folder and a missing file', () => {
    expect(checkUpload(root, join(out, 'secret.txt'))).toMatchObject({ ok: false })
    expect(checkUpload(root, '../x')).toMatchObject({ ok: false })
    expect(checkUpload(root, 'link.txt')).toMatchObject({ ok: false })
    expect(checkUpload(root, 'docs')).toMatchObject({ ok: false })
    expect(checkUpload(root, 'nope.txt')).toMatchObject({ ok: false })
    expect(checkUpload(root, '')).toMatchObject({ ok: false })
  })
})
