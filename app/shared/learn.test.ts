import { describe, expect, it } from 'vitest'
import { designDeck, dueCards, newCard, parseCards, planReviewPrompt, PROJECTS, review, tutorPrompt } from './learn'

const D = 86_400_000
describe('learn', () => {
  it('schedules with SM-2', () => {
    let c = newCard('x', 'a', 'b', 0)
    c = review(c, 4, 0)
    expect([c.reps, c.interval, c.due]).toEqual([1, 1, D])
    c = review(c, 4, D)
    expect([c.reps, c.interval]).toEqual([2, 6])
    c = review(c, 5, 7 * D)
    expect(c.interval).toBe(15)
    const failed = review(c, 0, 10 * D)
    expect([failed.reps, failed.interval, failed.due]).toEqual([0, 1, 11 * D])
    expect(failed.ease).toBeCloseTo(c.ease - 0.2)
    expect(review({ ...c, ease: 1.3 }, 3, 0).ease).toBe(1.3)
  })
  it('finds due cards and parses new ones', () => {
    const a = { ...newCard('x', 'a', 'b', 0), due: 5 }
    const b = { ...newCard('x', 'c', 'd', 0), due: 50 }
    expect(dueCards([b, a], 10).map((c) => c.front)).toEqual(['a'])
    expect(parseCards('What is CAP? :: Consistency, availability, partition tolerance\nnoise', 'sd').map((c) => [c.front, c.back])).toEqual([['What is CAP?', 'Consistency, availability, partition tolerance']])
    expect(parseCards('Q: Why a WAL?\nA: To recover after a crash.\n\nQ: What is fan-out?\nA: Copies per follower.', 'sd').map((c) => c.front)).toEqual(['Why a WAL?', 'What is fan-out?'])
    expect(designDeck().length).toBeGreaterThan(5)
  })
  it('writes tutor and review prompts', () => {
    expect(tutorPrompt(PROJECTS[0]!)).toMatch(/Do not write the solution/)
    expect(planReviewPrompt('checkout', '## Plan\n- add queue')).toContain('- add queue')
  })
})
