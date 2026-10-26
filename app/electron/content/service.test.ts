import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contentService } from './service'

describe('content service', () => {
  it('meters a tagged panel and moves on once the script is written', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ct-'))
    mkdirSync(join(dir, 'proj', 'studio', 'bz', 'roteiros'), { recursive: true })
    writeFileSync(join(dir, 'proj', 'studio', 'bz', 'gerar.py'), '')
    const s = contentService({ file: join(dir, 'content.json'), log: () => {}, changed: () => {} })
    const p = s.create({ title: 'Gel quando', project: join(dir, 'proj') })
    expect(p.engine).toBe('bzcorrida')
    s.scriptJob(p.id, 's7')
    s.onEvent('s7', { kind: 'limits', windows: [{ kind: 'five_hour', percentUsed: 12 }] })
    s.onEvent('s7', { kind: 'turn', inputTokens: 900, outputTokens: 300, cacheRead: 5000, cacheWrite: 0, costUsd: 0.05 })
    expect(s.list()[0]).toMatchObject({ stage: 'script', usage: { inputTokens: 900, turns: 1, window5hStart: 12 } })
    // the panel wrote the roteiro: the next turn takes its caption and moves to render
    writeFileSync(p.scriptPath!, JSON.stringify({ id: p.id, legenda: 'Gel a cada 45 min.' }))
    s.onEvent('s7', { kind: 'limits', windows: [{ kind: 'five_hour', percentUsed: 14.5 }] })
    s.onEvent('s7', { kind: 'turn', inputTokens: 100, outputTokens: 50, cacheRead: 0, cacheWrite: 0, costUsd: 0.01 })
    expect(s.list()[0]).toMatchObject({ stage: 'render', caption: 'Gel a cada 45 min.', usage: { inputTokens: 1000, turns: 2, window5hNow: 14.5 } })
    // another panel's turns do not count
    s.onEvent('s9', { kind: 'turn', inputTokens: 999, outputTokens: 0, cacheRead: 0, cacheWrite: 0, costUsd: 1 })
    expect(s.list()[0]!.usage.inputTokens).toBe(1000)
    expect(s.allowed('/etc/passwd')).toBe(false)
    expect(existsSync(join(dir, 'content.json'))).toBe(true)
  })
})
