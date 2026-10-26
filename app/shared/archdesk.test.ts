import { describe, expect, it } from 'vitest'
import { adrFile, adrTemplate, capacity, CHECKLIST, exerciseOf, isoWeek, nextNumber, parseAdr, reviewPrompt, setStatus } from './archdesk'

describe('architecture desk', () => {
  it('numbers and names ADRs', () => {
    expect(adrFile(3, 'Use Postgres for orders!')).toBe('0003-use-postgres-for-orders.md')
    expect(nextNumber(['0001-a.md', '0007-b.md', 'README.md'])).toBe(8)
    expect(nextNumber([])).toBe(1)
  })
  it('writes, reads and changes status', () => {
    const t = adrTemplate(4, 'Queue for emails', '2026-10-25', { supersedes: 2, context: 'Sends block requests.' })
    expect(parseAdr('0004-queue-for-emails.md', t)).toEqual({ n: 4, file: '0004-queue-for-emails.md', title: 'Queue for emails', status: 'proposed', date: '2026-10-25', supersedes: 2 })
    const acc = setStatus(t, 'accepted')
    expect(parseAdr('0004-x.md', acc).status).toBe('accepted')
    const old = setStatus('# 2. Sync email\n\n- Status: accepted\n', 'superseded', 4)
    expect(parseAdr('0002-x.md', old)).toMatchObject({ status: 'superseded', supersededBy: 4 })
    expect(parseAdr('0009-y.md', '# Without fields').status).toBe('proposed')
  })
  it('estimates capacity', () => {
    const c = capacity({ dau: 1_000_000, requestsPerUser: 86.4, peak: 3, readRatio: 0.9, payloadKb: 10, writeKb: 1, years: 2, replicas: 3 })
    expect(c.qpsAvg).toBeCloseTo(1000)
    expect(c.qpsPeak).toBeCloseTo(3000)
    expect(c.writeQps).toBeCloseTo(300)
    expect(c.egressMbps).toBeCloseTo(216)
    expect(c.storagePerYearGb).toBeCloseTo(3153.6)
    expect(c.storageTotalGb).toBeCloseTo(3153.6 * 6)
  })
  it('reviews with sources and rotates exercises', () => {
    expect(CHECKLIST.every((c) => c.link.startsWith('https://') && c.source)).toBe(true)
    const p = reviewPrompt('acme', 'PCI scope')
    expect(p).toContain('Do not change any file.')
    expect(p).toContain(`${CHECKLIST.length}. Decisions:`)
    expect(p).toContain('Also consider: PCI scope')
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1)
    expect(exerciseOf(new Date(2026, 9, 26))).not.toBe(exerciseOf(new Date(2026, 10, 2)))
  })
})
