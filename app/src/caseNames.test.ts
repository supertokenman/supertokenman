import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// macOS does not tell Team.tsx from team.ts: an import of './Team' can load the wrong file there while
// everything passes on Linux. No two modules in a folder may differ only by case.
describe('module names', () => {
  it('never differ only by case within a folder', () => {
    const clash: string[] = []
    const walk = (dir: string) => {
      const seen = new Map<string, string>()
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.') || e.name.startsWith('dist') || e.name === 'release') continue
        if (e.isDirectory()) walk(join(dir, e.name))
        else if (/\.(ts|tsx|js|cjs|mjs)$/.test(e.name)) {
          const mod = e.name.replace(/\.(test\.)?(ts|tsx|js|cjs|mjs)$/, '')
          const other = seen.get(mod.toLowerCase())
          if (other && other !== mod) clash.push(`${join(dir, other)} / ${join(dir, mod)}`)
          seen.set(mod.toLowerCase(), mod)
        }
      }
    }
    walk(join(__dirname, '..'))
    expect(clash).toEqual([])
  })
})
