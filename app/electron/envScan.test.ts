import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findEnvFiles, kindOf, mask, parseEnv, readValue, scan } from './envScan'

describe('env scan', () => {
  it('parses env lines', () => {
    expect(parseEnv('# c\nexport A=1\nB="two words"\nC=x # note\nD=\n')).toEqual([
      { name: 'A', value: '1' },
      { name: 'B', value: 'two words' },
      { name: 'C', value: 'x' },
      { name: 'D', value: '' },
    ])
  })
  it('masks and classifies', () => {
    expect(mask('sk_live_51Habcdefghij9f2a')).toBe('sk_l…9f2a')
    expect(mask('short')).toBe('•••••')
    expect(kindOf('DATABASE_URL', 'postgres://u:pw@h/db')).toBe('connection string')
    expect(kindOf('PORT', '3000')).toBe('setting')
    expect(kindOf('MY_SECRET', 'abcdefghijklmnop')).not.toBe('setting')
  })
  it('finds env files, flags git exposure and matches repeated values', async () => {
    const root = join(tmpdir(), `stm-env-${Date.now()}`)
    const a = join(root, 'proj-a')
    const b = join(root, 'proj-b')
    mkdirSync(join(a, 'node_modules', 'x'), { recursive: true })
    mkdirSync(b, { recursive: true })
    writeFileSync(join(a, '.env'), 'SUPABASE_KEY=eyJhbGciOiJIUzI1NiJ9.same.value\nPORT=3000\n')
    writeFileSync(join(a, 'node_modules', 'x', '.env'), 'IGNORED=1\n')
    writeFileSync(join(b, '.env.local'), 'SUPABASE_KEY=eyJhbGciOiJIUzI1NiJ9.same.value\n')
    writeFileSync(join(b, '.env.example'), 'SUPABASE_KEY=\n')
    const g = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' })
    g(a, 'init', '-q')
    g(a, 'add', '.env')
    g(a, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'oops')
    g(b, 'init', '-q')
    writeFileSync(join(b, '.gitignore'), '.env.local\n')
    expect(findEnvFiles([root]).map((p) => p.slice(root.length))).toEqual(['/proj-a/.env', '/proj-b/.env.example', '/proj-b/.env.local'])
    const files = await scan([root])
    const fa = files.find((f) => f.path.endsWith('proj-a/.env'))!
    const fb = files.find((f) => f.path.endsWith('.env.local'))!
    expect(fa.git).toMatchObject({ inRepo: true, tracked: true, inHistory: true })
    expect(fb.git).toMatchObject({ inRepo: true, tracked: false, ignored: true })
    expect(fa.keys[0]!.hash).toBe(fb.keys[0]!.hash)
    expect(JSON.stringify(files)).not.toContain('same.value')
    expect(files.find((f) => f.template)!.keys[0]!.kind).toBe('empty')
    expect(readValue(join(a, '.env'), 'PORT')).toBe('3000')
    expect(readValue(join(a, 'package.json'), 'X')).toBeUndefined()
  })
  it('sees a committed file through a symlinked folder, as /var is on macOS', async () => {
    const real = mkdtempSync(join(tmpdir(), 'stm-env-real-'))
    const link = `${real}-link`
    symlinkSync(real, link)
    writeFileSync(join(real, '.env'), 'API_KEY=abcdefghijklmnop\n')
    const g = (...args: string[]) => execFileSync('git', ['-C', real, ...args], { stdio: 'ignore' })
    g('init', '-q')
    g('add', '.env')
    g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'oops')
    const [f] = await scan([link])
    expect(f!.git).toMatchObject({ inRepo: true, tracked: true, inHistory: true })
  })
})
