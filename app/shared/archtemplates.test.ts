import { describe, expect, it } from 'vitest'
import { TEMPLATES, templateModel } from './archtemplates'
import { cells, check } from './drawio'

describe('architecture templates', () => {
  it('has six, each a valid draw.io model', () => {
    expect(TEMPLATES).toHaveLength(6)
    for (const t of TEMPLATES) {
      const m = templateModel(t)
      expect(check(m), t.id).toEqual({ ok: true, problems: [] })
      const cs = cells(m)
      expect(cs.filter((c) => c.vertex)).toHaveLength(t.nodes.length)
      expect(cs.filter((c) => c.edge)).toHaveLength(t.links.length)
    }
  })
  it('boxes do not overlap and sit on the grid', () => {
    for (const t of TEMPLATES) {
      for (const a of t.nodes) {
        expect(a.x % 10 + a.y % 10, `${t.id}/${a.id}`).toBe(0)
        for (const b of t.nodes) if (a !== b) expect(Math.abs(a.x - b.x) >= 150 || Math.abs(a.y - b.y) >= 60, `${t.id}: ${a.id} over ${b.id}`).toBe(true)
      }
    }
  })
  it('names no cloud vendor', () => {
    const all = JSON.stringify(TEMPLATES)
    expect(all).not.toMatch(/\b(AWS|Amazon|Azure|GCP|Google Cloud|Cloudflare|Vercel|S3|Lambda|DynamoDB)\b/)
  })
  it('keeps the cut-corner look', () => {
    expect(templateModel(TEMPLATES[0]!)).toContain('shape=card;size=12')
  })
})
