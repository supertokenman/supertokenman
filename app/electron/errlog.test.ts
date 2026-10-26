import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { errlog, report } from './errlog'

const KEY = 'sk-ant-api03-' + 'Q1w2E3r4T5y6U7i8O9p0A1s2D3f4G5h6J7k8L9z0'
const GH = 'ghp_' + 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'

describe('local error log', () => {
  it('writes masked entries and keeps them for the screen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'log-'))
    const l = errlog(dir)
    l.error('ipc:vault', new Error(`bad key ${KEY}`))
    l.warn('fetch', `token ${GH} refused`)
    const text = readFileSync(l.file, 'utf8')
    expect(text).not.toContain(KEY)
    expect(text).not.toContain(GH)
    expect(text).toMatch(/ERROR \[ipc:vault\] bad key sk-a/)
    expect(l.recent().map((e) => e.where)).toEqual(['fetch', 'ipc:vault'])
  })
  it('rotates at 2 MB and keeps three old files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'log-'))
    const l = errlog(dir)
    for (let i = 0; i < 5; i++) {
      writeFileSync(l.file, 'x'.repeat(2 * 1024 * 1024 + 10))
      l.info('t', `round ${i}`)
    }
    expect(readdirSync(dir).sort()).toEqual(['main.log', 'main.log.1', 'main.log.2', 'main.log.3'])
  })
  it('makes a masked report', () => {
    const r = report({ version: '0.1.0', electron: '44' }, [{ at: 0, level: 'error', where: 'x', text: `leak ${KEY}` }])
    expect(r).toContain('- version: 0.1.0')
    expect(r).not.toContain(KEY)
  })
})
