import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ROTATE_BYTES } from '../shared/auditlog'
import { AuditLog, retentionDays } from './audit'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'stm-audit-'))
  dirs.push(d)
  return d
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

const base = { panel: 'p1', project: 'proj', turn: 0, tool: 'Bash', decision: 'allow' as const, by: 'default' as const, kind: 'tool' as const }
const at = new Date(2026, 9, 30, 12).getTime()

describe('AuditLog', () => {
  it('appends redacted rows, one per line, never rewriting', () => {
    const dir = tmp()
    const log = new AuditLog(join(dir, 'audit'), { known: () => [{ name: 'K', value: 'hunter2-secret-value' }] })
    expect(log.write({ ...base, at, args: 'echo hunter2-secret-value TOKEN=abcdef123456 https://u:pw@example.com/x' })).toBe(true)
    expect(log.write({ ...base, at: at + 1, args: 'ls' })).toBe(true)
    const text = readFileSync(join(dir, 'audit', '2026-10-30.jsonl'), 'utf8')
    expect(text.trim().split('\n')).toHaveLength(2)
    expect(text).not.toContain('hunter2-secret-value')
    expect(text).not.toContain('abcdef123456')
    expect(text).not.toContain('u:pw@')
  })
  it('rolls to .2 and then .3 as files pass 50 MB', () => {
    const dir = tmp()
    const a = join(dir, 'audit')
    const log = new AuditLog(a)
    log.write({ ...base, at, args: 'x' })
    writeFileSync(join(a, '2026-10-30.jsonl'), Buffer.alloc(ROTATE_BYTES + 1))
    log.write({ ...base, at, args: 'y' })
    writeFileSync(join(a, '2026-10-30.2.jsonl'), Buffer.alloc(ROTATE_BYTES + 1))
    log.write({ ...base, at, args: 'z' })
    expect(readdirSync(a).sort()).toEqual(['2026-10-30.2.jsonl', '2026-10-30.3.jsonl', '2026-10-30.jsonl'])
    expect(readFileSync(join(a, '2026-10-30.3.jsonl'), 'utf8')).toContain('"z"')
  })
  it('retries once, then reports one note and returns false', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'blocker'), 'a file where the folder should be')
    const notes: string[] = []
    const log = new AuditLog(join(dir, 'blocker', 'audit'), { onFail: (m) => notes.push(m) })
    expect(log.write({ ...base, at, args: 'a' })).toBe(false)
    expect(log.write({ ...base, at, args: 'b' })).toBe(false)
    expect(notes).toHaveLength(1)
  })
  it('purges files past the retention and lists days', () => {
    const dir = tmp()
    const a = join(dir, 'audit')
    const log = new AuditLog(a, { now: () => at })
    log.write({ ...base, at: new Date(2026, 5, 1).getTime(), args: 'old' })
    log.write({ ...base, at, args: 'new' })
    expect(log.days()).toEqual(['2026-10-30', '2026-06-01'])
    expect(log.purge(90)).toEqual(['2026-06-01.jsonl'])
    expect(log.days()).toEqual(['2026-10-30'])
  })
  it('queries by filter, newest first, with a limit', () => {
    const dir = tmp()
    const log = new AuditLog(join(dir, 'audit'))
    for (let i = 0; i < 5; i++) log.write({ ...base, at: at + i, args: `cmd ${i}`, tool: i % 2 ? 'Edit' : 'Bash', panel: i < 3 ? 'p1' : 'p2' })
    const all = log.query({ from: at - 1000, to: at + 1000 })
    expect(all.map((r) => r.args)).toEqual(['cmd 4', 'cmd 3', 'cmd 2', 'cmd 1', 'cmd 0'])
    expect(log.query({ from: at - 1000, to: at + 1000, tool: 'Edit' })).toHaveLength(2)
    expect(log.query({ from: at - 1000, to: at + 1000, panel: 'p2' })).toHaveLength(2)
    expect(log.query({ from: at - 1000, to: at + 1000, text: 'CMD 2' })).toHaveLength(1)
    expect(log.query({ from: at - 1000, to: at + 1000, limit: 2 })).toHaveLength(2)
  })
  it('retention is clamped to 7..365 with 90 as the default', () => {
    expect(retentionDays(undefined)).toBe(90)
    expect(retentionDays(3)).toBe(90)
    expect(retentionDays(7)).toBe(7)
    expect(retentionDays(9999)).toBe(365)
  })
})
