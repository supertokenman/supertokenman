import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CACHE_FILE, excludeCache, setSymbolsDir, symbolsServer } from './symbols'

describe('symbols', () => {
  it('keeps the index cache out of git once, and leaves a folder without git alone', () => {
    const repo = mkdtempSync(join(tmpdir(), 'sym-'))
    mkdirSync(join(repo, '.git', 'info'), { recursive: true })
    writeFileSync(join(repo, '.git', 'info', 'exclude'), '# git ls-files --others --exclude-from=.git/info/exclude\n*.log')
    expect(excludeCache(repo)).toBe(true)
    expect(excludeCache(repo)).toBe(false)
    expect(readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8')).toBe(`# git ls-files --others --exclude-from=.git/info/exclude\n*.log\n# the code index of SuperTokenMan\n${CACHE_FILE}\n`)
    expect(excludeCache(mkdtempSync(join(tmpdir(), 'plain-')))).toBe(false)
  })
  it('indexes only the panel folder, with the lean profile, and keeps its data in the app', () => {
    setSymbolsDir('/eng', '/app/symbols')
    expect(symbolsServer('/proj')).toMatchObject({ command: '/eng/.venv/bin/token-savior', env: { WORKSPACE_ROOTS: '/proj', TOKEN_SAVIOR_PROFILE: 'optimized', TOKEN_SAVIOR_DATA_DIR: '/app/symbols/data' } })
  })
})
