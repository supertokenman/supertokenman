import { describe, expect, it } from 'vitest'
import { AUDIT_VERSION, buildRow, dayOf, expired, fileFor, ROTATE_BYTES } from './auditlog'

const at = new Date(2026, 9, 30, 14, 5).getTime()

describe('buildRow', () => {
  it('sets the schema version and redacts and caps the args', () => {
    const row = buildRow({
      at,
      panel: 'p1',
      project: 'app',
      turn: 3,
      tool: 'Bash',
      args: `NPM_TOKEN=abcdefghijklmnop ${'x'.repeat(400)}`,
      decision: 'ask',
      by: 'rule',
      rule: 'project:3 network',
      kind: 'tool',
    })
    expect(row.v).toBe(AUDIT_VERSION)
    expect(row.args).not.toContain('abcdefghijklmnop')
    expect(row.args.length).toBe(300)
    expect(row.rule).toBe('project:3 network')
    expect('costUsd' in row).toBe(false)
    expect('files' in row).toBe(false)
  })

  it('keeps receipt file lists and turn cost', () => {
    const row = buildRow({
      at,
      panel: 'p1',
      project: 'app',
      turn: 4,
      tool: '',
      args: '',
      decision: 'allow',
      by: 'app',
      costUsd: 0.12,
      kind: 'receipt',
      files: [{ path: 'a.ts', change: 'M' }],
    })
    expect(row).toMatchObject({ kind: 'receipt', costUsd: 0.12, files: [{ path: 'a.ts', change: 'M' }] })
  })
})

describe('fileFor', () => {
  it('uses the plain day file up to 50 MB and the .2 file above it', () => {
    expect(fileFor('2026-10-30', 0)).toBe('2026-10-30.jsonl')
    expect(fileFor('2026-10-30', ROTATE_BYTES)).toBe('2026-10-30.jsonl')
    expect(fileFor('2026-10-30', ROTATE_BYTES + 1)).toBe('2026-10-30.2.jsonl')
  })

  it('names the file from the local day of a Date', () => {
    expect(fileFor(new Date(at), 10)).toBe('2026-10-30.jsonl')
    expect(dayOf(new Date(2026, 0, 2, 23, 59).getTime())).toBe('2026-01-02')
  })
})

describe('expired', () => {
  const now = new Date(2026, 9, 30, 9, 0).getTime()
  it('lists day files older than the retention and keeps the rest', () => {
    const files = ['2026-07-01.jsonl', '2026-07-02.2.jsonl', '2026-08-01.jsonl', '2026-10-30.jsonl', 'notes.txt', '2026-10-30.2.jsonl']
    expect(expired(files, now, 90)).toEqual(['2026-07-01.jsonl', '2026-07-02.2.jsonl'])
  })

  it('a file exactly at the retention boundary is kept', () => {
    // 2026-08-01 is 90 days before 2026-10-30
    expect(expired(['2026-08-01.jsonl'], now, 90)).toEqual([])
    expect(expired(['2026-07-31.jsonl'], now, 90)).toEqual(['2026-07-31.jsonl'])
  })

  it('respects a shorter setting', () => {
    expect(expired(['2026-10-20.jsonl', '2026-10-29.jsonl'], now, 7)).toEqual(['2026-10-20.jsonl'])
  })
})
