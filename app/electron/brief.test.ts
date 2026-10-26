import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { briefFile, briefFor, parseBrief, projectMap, saveStopped, transcriptOf } from './brief'
import { remember, rememberDecisions } from './memory'

function project() {
  const cwd = mkdtempSync(join(tmpdir(), 'stm-proj-'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'shop', description: 'A small shop', scripts: { dev: 'vite', test: 'vitest' }, dependencies: { react: '18', stripe: '1' } }))
  mkdirSync(join(cwd, 'src'))
  writeFileSync(join(cwd, 'src', 'a.ts'), 'x')
  writeFileSync(join(cwd, 'src', 'b.tsx'), 'x')
  mkdirSync(join(cwd, 'node_modules'))
  writeFileSync(join(cwd, 'README.md'), '# Shop\n\nSells things online.\n')
  execFileSync('git', ['init', '-q', cwd])
  execFileSync('git', ['-C', cwd, '-c', 'user.email=a@b', '-c', 'user.name=a', 'add', '.'])
  execFileSync('git', ['-C', cwd, '-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-qm', 'First cut of the cart'])
  return cwd
}

describe('project brief', () => {
  it('maps a project from its files, with no model', () => {
    const map = projectMap(project())
    expect(map).toContain('**shop**: A small shop')
    expect(map).toContain('Stack: react, stripe')
    expect(map).toContain('`npm run dev`, `npm run test`')
    expect(map).toContain('`src/`: 2 files')
    expect(map).not.toContain('node_modules')
    expect(map).toContain('- First cut of the cart')
  })
  it('keeps where we stopped and the decisions, and refreshes the map when the code moves on', () => {
    const cwd = project()
    const vault = mkdtempSync(join(tmpdir(), 'stm-vault-'))
    expect(briefFor(vault, 'shop', cwd)).toContain('## Map')
    saveStopped(vault, 'shop', cwd, '- Checkout works\n- Next: refunds in `src/refund.ts`')
    rememberDecisions(vault, 'shop', [{ what: 'Use Stripe Checkout', why: 'no PCI scope' }])
    const b = briefFor(vault, 'shop', cwd)
    expect(b).toContain('## Where we stopped\n\n- Checkout works')
    expect(b).toContain('- Use Stripe Checkout (no PCI scope)')
    // a new commit: the map is rebuilt, where we stopped stays
    writeFileSync(join(cwd, 'src', 'c.ts'), 'x')
    execFileSync('git', ['-C', cwd, '-c', 'user.email=a@b', '-c', 'user.name=a', 'add', '.'])
    execFileSync('git', ['-C', cwd, '-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-qm', 'Refunds'])
    const after = parseBrief(readFileSync(briefFile(vault, 'shop'), 'utf8'))
    expect(after.stopped).toContain('Checkout works')
    expect(briefFor(vault, 'shop', cwd)).toContain('- Refunds')
    remember(vault, 'shop', 'note', 'x')
  })
  it('finds a transcript only by a safe session id', () => {
    expect(transcriptOf('/x', '../../etc/passwd')).toBeNull()
  })
})
