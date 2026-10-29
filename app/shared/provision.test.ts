import { describe, expect, it } from 'vitest'
import { DEFAULT_CAP_USD, MAX_PANELS, planFromBundle, previewLines, summaryForAgent } from './provision'
import { toMarkdown, type Team } from './teambundle'

const panel = (name: string) => ({ name, folder: '.', instructions: `Do the ${name} work.` })

const team = (names: string[]): Team => ({
  name: 'Launch',
  description: 'Ships the launch.',
  panels: names.map(panel),
  links: names.length > 1 ? [{ a: names[0], b: names[1], auto: false, capUsd: 1 }] : [],
  triggers: [{ name: 'Nightly', panel: names[0], when: 'every night', prompt: 'Check the build.' }],
})

const md = (names: string[]) => toMarkdown(team(names))

describe('planFromBundle', () => {
  it('builds a plan with a loop and the given cap', () => {
    const p = planFromBundle(md(['Builder', 'Reviewer']), {
      loop: { build: 'Builder', review: 'Reviewer', rounds: 4, maxUsd: 1.5 },
      capUsd: 10,
    })
    expect(p.team.name).toBe('Launch')
    expect(p.capUsd).toBe(10)
    expect(p.loop).toEqual({ build: 'Builder', review: 'Reviewer', rounds: 4, maxUsd: 1.5 })
  })

  it('uses the default cap, rounds and loop cap when none are given', () => {
    const p = planFromBundle(md(['Builder', 'Reviewer']), { loop: { build: 'Builder', review: 'Reviewer' } })
    expect(p.capUsd).toBe(DEFAULT_CAP_USD)
    expect(p.loop?.rounds).toBe(3)
    expect(p.loop?.maxUsd).toBe(2)
  })

  it('has no loop when none is asked for', () => {
    expect(planFromBundle(md(['Solo'])).loop).toBeUndefined()
  })

  it('throws when there are more than 8 panels', () => {
    const names = Array.from({ length: MAX_PANELS + 1 }, (_, i) => `P${i}`)
    expect(() => planFromBundle(md(names))).toThrow('A team can start with at most 8 panels.')
  })

  it('throws when the loop names a panel not in the team', () => {
    expect(() => planFromBundle(md(['Builder', 'Reviewer']), { loop: { build: 'Builder', review: 'Ghost' } })).toThrow(
      /must name panels that are in the team/,
    )
  })

  it('throws when the build and review panel are the same', () => {
    expect(() => planFromBundle(md(['Builder', 'Reviewer']), { loop: { build: 'Builder', review: 'Builder' } })).toThrow(
      /two different panels/,
    )
  })

  it('throws when the cap is above 50', () => {
    expect(() => planFromBundle(md(['Solo']), { capUsd: 51 })).toThrow(/at most \$50/)
  })

  it('throws when the loop cap is above the team cap', () => {
    expect(() =>
      planFromBundle(md(['Builder', 'Reviewer']), { loop: { build: 'Builder', review: 'Reviewer', maxUsd: 3 }, capUsd: 2 }),
    ).toThrow(/no more than the team's cap/)
  })

  it('throws when rounds are outside 1 to 10', () => {
    expect(() => planFromBundle(md(['Builder', 'Reviewer']), { loop: { build: 'Builder', review: 'Reviewer', rounds: 11 } })).toThrow(
      /1 to 10 rounds/,
    )
  })

  it('passes parse errors through in plain English', () => {
    expect(() => planFromBundle('no heading here')).toThrow(/no "# Team:" heading/)
  })
})

describe('previewLines', () => {
  it('ends with the spend cap line', () => {
    const lines = previewLines(planFromBundle(md(['Solo'])))
    expect(lines[lines.length - 1]).toBe('Spend cap for this team: $5.00. Nothing is created until you press Create.')
  })

  it('includes the loop line before the cap when a loop is set', () => {
    const lines = previewLines(planFromBundle(md(['Builder', 'Reviewer']), { loop: { build: 'Builder', review: 'Reviewer' } }))
    expect(lines).toContain('Review loop: Builder builds, Reviewer reviews, up to 3 rounds, stops at $2.00')
    expect(lines[lines.length - 2]).toBe('Review loop: Builder builds, Reviewer reviews, up to 3 rounds, stops at $2.00')
  })
})

describe('summaryForAgent', () => {
  it('stays within 400 characters and mentions the approval', () => {
    const names = Array.from({ length: MAX_PANELS }, (_, i) => `Panel number ${i}`)
    const s = summaryForAgent(planFromBundle(md(names), { loop: { build: names[0], review: names[1] }, capUsd: 50 }))
    expect(s.length).toBeLessThanOrEqual(400)
    expect(s).toContain('approves it')
  })
})
