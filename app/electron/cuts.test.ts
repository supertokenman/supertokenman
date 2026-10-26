import { describe, expect, it } from 'vitest'
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CutWatcher, type Cut } from './cuts'

const line = (session: string, kind = 'wrap') => JSON.stringify({ ts: '2026-10-22T12:00:00Z', kind, session, inChars: 40400, outChars: 400, cmd: 'npm test' }) + '\n'

describe('CutWatcher', () => {
  it('reports only new lines, with tokens kept out, and follows a new month', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stm-kit-'))
    const oct = join(dir, 'stats-2026-10.jsonl')
    writeFileSync(oct, line('old'))
    const cuts: Cut[] = []
    const w = new CutWatcher(dir, (c) => cuts.push(c))
    w.start(new Date('2026-10-22T12:00:00Z'))
    w.poll(new Date('2026-10-22T12:00:01Z'))
    expect(cuts).toEqual([])
    appendFileSync(oct, line('s1') + line('s1', 'read-guard') + line('s2').slice(0, 20))
    w.poll(new Date('2026-10-22T12:00:02Z'))
    expect(cuts).toEqual([{ session: 's1', tokens: 10000, at: Date.parse('2026-10-22T12:00:00Z'), cmd: 'npm test' }])
    // the rest of a line written in two parts
    appendFileSync(oct, line('s2').slice(20))
    w.poll(new Date('2026-10-22T12:00:03Z'))
    expect(cuts.map((c) => c.session)).toEqual(['s1', 's2'])
    writeFileSync(join(dir, 'stats-2026-11.jsonl'), line('s3'))
    w.poll(new Date('2026-11-01T00:00:01Z'))
    expect(cuts.map((c) => c.session)).toEqual(['s1', 's2', 's3'])
  })
})
