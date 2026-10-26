import { describe, expect, it } from 'vitest'
import { applyRules, briefingDue, checkFeedRule, digestPrompt, isVideo, newsletterItem, parseOpml, toOpml, type FeedItem } from './feeds'

const item = (id: string, title: string, over: Partial<FeedItem> = {}): FeedItem => ({ id, feed: 'https://a.test/feed', source: 'A', title, link: `https://a.test/${id}`, date: '2026-10-25T10:00:00Z', summary: '', ...over })

describe('feeds', () => {
  it('reads OPML with folders and writes it back', () => {
    const opml = `<?xml version="1.0"?><opml version="1.0"><body>
      <outline text="Tech"><outline text="Simon" title="Simon Willison" type="rss" xmlUrl="https://simonwillison.net/atom/everything/"/>
      <outline text="HN" xmlUrl="https://hnrss.org/frontpage?points=100&amp;x=1"/></outline>
      <outline text="dup" xmlUrl="https://hnrss.org/frontpage?points=100&amp;x=1"/><outline text="bad" xmlUrl="javascript:alert(1)"/></body></opml>`
    const feeds = parseOpml(opml)
    expect(feeds).toEqual([{ url: 'https://simonwillison.net/atom/everything/', title: 'Simon Willison' }, { url: 'https://hnrss.org/frontpage?points=100&x=1', title: 'HN' }])
    expect(parseOpml(toOpml(feeds))).toEqual(feeds)
    expect(toOpml(feeds)).toContain('points=100&amp;x=1')
  })

  it('applies rules on arrival and keeps videos as links', () => {
    const items = [
      item('1', 'Sponsored: buy crypto now'),
      item('2', 'Claude Code ships hooks v2', { source: 'Anthropic' }),
      item('3', 'Deploying Workers with D1'),
      item('4', 'Talk: local models', { link: 'https://www.youtube.com/watch?v=abc', image: 'https://i.ytimg.com/x.jpg' }),
    ]
    const r = applyRules(items, [
      { id: 'a', words: 'sponsored', field: 'title', action: 'hide' },
      { id: 'b', words: 'anthropic', field: 'source', action: 'star' },
      { id: 'c', words: 'claude', field: 'any', action: 'notify' },
      { id: 'd', words: 'workers d1', field: 'any', action: 'summarize' },
    ])
    expect(r.hidden).toBe(1)
    expect(r.items.map((i) => i.id)).toEqual(['2', '3', '4'])
    expect(r.items[0]!.starred).toBe(true)
    expect(r.toNotify).toEqual(['2'])
    expect(r.toSummarize).toEqual(['3'])
    expect(r.items[2]).toMatchObject({ video: true })
    expect(r.items[2]!.image).toBeUndefined()
    expect(isVideo({ link: 'https://youtu.be/x', feed: '' })).toBe(true)
    expect(checkFeedRule({ words: ' ', action: 'hide' })).toMatch(/words/)
  })

  it('numbers the digest sources, starred first', () => {
    const { prompt, used } = digestPrompt([item('1', 'Old', { date: '2026-10-20T00:00:00Z' }), item('2', 'Starred one', { starred: true, date: '2026-10-19T00:00:00Z' }), item('3', 'New', { aiSummary: 'Two sentences.' })])
    expect(used.map((i) => i.id)).toEqual(['2', '3', '1'])
    expect(prompt).toContain('[1] Starred one (A, starred)')
    expect(prompt).toContain('[2] New (A): Two sentences.')
  })

  it('knows when a daily or weekly briefing is due', () => {
    const d = { on: true, every: 'daily' as const, day: 1, time: '07:30' }
    expect(briefingDue(d, new Date(2026, 9, 25, 7, 0))).toBe(false)
    expect(briefingDue(d, new Date(2026, 9, 25, 8, 0))).toBe(true)
    expect(briefingDue({ ...d, lastAt: new Date(2026, 9, 25, 7, 31).getTime() }, new Date(2026, 9, 25, 9, 0))).toBe(false)
    // weekly on Monday: Sunday the 25th is due for the Monday before (the 19th), unless it was made since
    const w = { ...d, every: 'weekly' as const }
    expect(briefingDue({ ...w, lastAt: new Date(2026, 9, 19, 8, 0).getTime() }, new Date(2026, 9, 25, 9, 0))).toBe(false)
    expect(briefingDue({ ...w, lastAt: new Date(2026, 9, 12, 8, 0).getTime() }, new Date(2026, 9, 25, 9, 0))).toBe(true)
    expect(briefingDue({ ...d, on: false }, new Date(2026, 9, 25, 9, 0))).toBe(false)
  })

  it('turns newsletter mail into reader items', () => {
    expect(newsletterItem({ id: 'm1', subject: 'Issue 42', from: { name: 'Bytes', address: 'hi@bytes.dev' }, at: '2026-10-25T08:00:00Z', preview: 'This week…' }, 'gmail')).toMatchObject({ id: 'nl-gmail-m1', source: 'Bytes', newsletter: true, link: '' })
  })
})
