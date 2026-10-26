import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { diffTrees, innerArgs, innerDir, sandboxName } from './sandbox'

describe('sandbox', () => {
  it('names one sandbox per folder, safely', () => {
    expect(sandboxName('/Users/a/My App!')).toMatch(/^stm-my-app-[0-9a-f]{6}$/)
    expect(sandboxName('/a/x')).not.toBe(sandboxName('/b/x'))
    expect(innerDir('/Users/a/my app')).toBe('/sandbox/my app')
  })
  it('runs claude inside whatever the SDK launches', () => {
    expect(innerArgs('/usr/bin/node', ['/x/cli.js', '--output-format', 'stream-json'])).toEqual(['--output-format', 'stream-json'])
    expect(innerArgs('/x/claude', ['--verbose'])).toEqual(['--verbose'])
  })
  it('tells added, changed and deleted files apart, skipping node_modules', () => {
    const a = mkdtempSync(join(tmpdir(), 'in-'))
    const b = mkdtempSync(join(tmpdir(), 'out-'))
    writeFileSync(join(a, 'same.ts'), 'x')
    writeFileSync(join(b, 'same.ts'), 'x')
    writeFileSync(join(a, 'edit.ts'), 'new')
    writeFileSync(join(b, 'edit.ts'), 'old')
    mkdirSync(join(a, 'src'))
    writeFileSync(join(a, 'src', 'new.ts'), 'n')
    writeFileSync(join(b, 'gone.ts'), 'g')
    mkdirSync(join(a, 'node_modules'))
    writeFileSync(join(a, 'node_modules', 'x.js'), '1')
    expect(diffTrees(a, b)).toEqual([
      { path: 'edit.ts', kind: 'changed' },
      { path: 'gone.ts', kind: 'deleted' },
      { path: join('src', 'new.ts'), kind: 'added' },
    ])
  })
})
