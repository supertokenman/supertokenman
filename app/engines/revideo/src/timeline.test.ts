import { describe, expect, it } from 'vitest'
import { captionGroups, LEAD, timeline, wordTimes } from './timeline.js'

const d = { template: 'explainer', say: { hook: 'Você aquece errado', cta: 'Segue' }, points: [] } as never

describe('timeline word times', () => {
  it('uses the measured word times when the voice engine gave them', () => {
    const tl = timeline(d, { hook: 1.5 }, { hook: [{ w: 'Você', s: 0, e: 0.2 }, { w: 'aquece', s: 0.2, e: 0.6 }, { w: 'errado', s: 0.6, e: 1.0 }] })
    expect(wordTimes(tl[0])).toEqual([
      { word: 'Você', start: LEAD, end: LEAD + 0.2 },
      { word: 'aquece', start: LEAD + 0.2, end: LEAD + 0.6 },
      { word: 'errado', start: LEAD + 0.6, end: LEAD + 1.0 },
    ])
  })
  it('spreads words by length when there are no measured times', () => {
    const w = wordTimes(timeline(d, { hook: 1.5 })[0])
    expect(w).toHaveLength(3)
    expect(w[2].end).toBeCloseTo(LEAD + 1.5)
  })
})

describe('caption groups', () => {
  it('keeps chunks of four and never crosses a sentence', () => {
    expect(captionGroups('Most of your running should feel easy. That is where endurance is built.'.split(' '))).toEqual([[0, 4], [4, 7], [7, 11], [11, 13]])
  })
})
