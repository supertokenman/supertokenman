import { describe, expect, it } from 'vitest'
import { draft, parseGroups, radar } from './radar'

const now = Date.parse('2026-10-25T20:00:00Z')
const at = (h: number) => new Date(now - h * 3600_000).toISOString()
const it_ = (id: string, title: string, source: string, h: number, summary = '') => ({ id, feed: source, source, title, link: `https://x/${id}`, date: at(h), summary })
const items = [
  it_('1', 'Claude Code adds hooks for compaction', 'HN', 2),
  it_('2', 'Anthropic ships a new Claude model', 'The Verge', 5),
  it_('3', 'Pix por aproximação chega a mais bancos', 'Folha', 3),
  it_('4', 'PIX outage hits banks for an hour', 'Reuters', 1),
  it_('5', 'Claude Monet exhibit opens in Paris', 'Arts', 4),
  it_('6', 'Old Claude news', 'HN', 40),
]
const groups = parseGroups(`# my radar
AI coding: claude code, anthropic, claude* | -monet
Pix: pix, pagamento instantaneo
Nothing: kubernetes`)

describe('topic radar', () => {
  it('parses groups with synonyms and exclusions', () => {
    expect(groups[0]).toEqual({ name: 'AI coding', words: ['claude code', 'anthropic', 'claude*'], exclude: ['monet'] })
    expect(groups).toHaveLength(3)
  })
  it('counts in the window, excludes, ignores accents and case, ranks by weighted score', () => {
    const hits = radar(items, groups, { now, weight: (s) => (s === 'Reuters' ? 3 : 1) })
    expect(hits.map((h) => [h.group, h.count, h.score])).toEqual([['Pix', 2, 4], ['AI coding', 2, 2]])
    expect(hits[1]!.items.map((i) => i.id)).toEqual(['1', '2'])
  })
  it('only new since the last summary', () => {
    expect(radar(items, groups, { now, since: now - 2.5 * 3600_000 }).map((h) => [h.group, h.count])).toEqual([['AI coding', 1], ['Pix', 1]])
  })
  it('writes a plain draft', () => {
    expect(draft(radar(items, groups, { now }), 'Radar')).toBe('Radar:\n- AI coding: 2 items from 2 sources. Top: Claude Code adds hooks for compaction (HN)\n- Pix: 2 items from 2 sources. Top: Pix por aproximação chega a mais bancos (Folha)')
    expect(draft([], 'Radar')).toBe('Radar: nothing from your groups.')
  })
})
