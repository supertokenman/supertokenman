import { describe, expect, it } from 'vitest'
import { MAX_INSTRUCTIONS, parseBundle, reviewLines, toMarkdown, type Team } from './teambundle'

const team: Team = {
  name: 'Shop',
  description: 'The API and the storefront, built and reviewed together.',
  panels: [
    { name: 'api', folder: './api', persona: 'backend', instructions: 'Own the REST endpoints.' },
    { name: 'web', folder: '.', instructions: '' },
  ],
  links: [{ a: 'api', b: 'web', auto: false, capUsd: 2 }],
  triggers: [{ name: 'nightly', panel: 'api', when: '0 3 * * *', prompt: 'Run the test suite and report.' }],
}

const bad = (md: string) => () => parseBundle(md)

describe('team bundle', () => {
  it('round trips a normalized team', () => {
    expect(parseBundle(toMarkdown(team))).toEqual(team)
  })

  it('keeps instructions with blank lines and lists', () => {
    const instructions = 'Rules:\n\n- keep tests green\n- no new deps\n\n1. read first\n2. then edit'
    const t: Team = { ...team, panels: [{ name: 'api', folder: './api', instructions }], links: [] }
    const back = parseBundle(toMarkdown(t))
    expect(back.panels[0].instructions).toBe(instructions)
  })

  it('cuts instructions to the limit', () => {
    const t: Team = { ...team, panels: [{ name: 'api', folder: '.', instructions: 'x'.repeat(MAX_INSTRUCTIONS + 50) }], links: [] }
    expect(parseBundle(toMarkdown(t)).panels[0].instructions.length).toBe(MAX_INSTRUCTIONS)
  })

  it('refuses a file without the Team heading', () => {
    expect(bad('## Panel: api\n- folder: .\n')).toThrow('no "# Team:" heading')
  })

  it('refuses a team with no panels', () => {
    expect(bad('# Team: Empty\n\nNothing here.\n')).toThrow('The team has no panels')
  })

  it('refuses a link or trigger that names a missing panel', () => {
    const link = toMarkdown({ ...team, links: [{ a: 'api', b: 'ghost', auto: false }] })
    expect(bad(link)).toThrow('"ghost", which is not in the team')
    const trig = toMarkdown({ ...team, triggers: [{ name: 'x', panel: 'ghost', when: '', prompt: 'hi' }] })
    expect(bad(trig)).toThrow('Trigger x names panel "ghost"')
  })

  it('refuses duplicate panel names', () => {
    const md = toMarkdown({ ...team, panels: [team.panels[0], { ...team.panels[0], folder: './other' }], links: [] })
    expect(bad(md)).toThrow('Two panels are named "api"')
  })

  it('refuses folders outside the project', () => {
    expect(bad(toMarkdown({ ...team, panels: [{ name: 'a', folder: '/etc', instructions: '' }], links: [] }))).toThrow('Folders must stay inside the project: /etc')
    expect(bad(toMarkdown({ ...team, panels: [{ name: 'a', folder: '../other', instructions: '' }], links: [] }))).toThrow('Folders must stay inside the project: ../other')
  })

  it('refuses more than twelve panels', () => {
    const panels = Array.from({ length: 13 }, (_, i) => ({ name: `p${i}`, folder: '.', instructions: '' }))
    expect(bad(toMarkdown({ ...team, panels, links: [] }))).toThrow('at most 12 panels')
  })

  it('says triggers come in turned off, and shows link and cap', () => {
    const lines = reviewLines(team)
    expect(lines).toContain('Panel api in ./api, persona backend')
    expect(lines).toContain('Link api <-> web, waits, cap $2.00')
    expect(lines).toContain('Trigger nightly for api (0 3 * * *) (comes in turned off; webhook and gate not imported)')
  })
  it('keeps a prose line that looks like a heading', () => {
    const t: Team = { name: 'x', description: 'd', panels: [{ name: 'api', folder: '.', instructions: '## Panel: not a panel\n# notes\nok' }], links: [], triggers: [] }
    expect(parseBundle(toMarkdown(t)).panels[0]!.instructions).toBe('## Panel: not a panel\n# notes\nok')
  })

  it('round trips a trigger scope and lists it in the review', () => {
    const scope = { read: ['docs', 'src'], write: ['src'], commands: ['npm test', 'git status'] }
    const t = { ...team, triggers: [{ ...team.triggers[0]!, scope }] }
    expect(parseBundle(toMarkdown(t))).toEqual(t)
    expect(reviewLines(t)).toContain('Trigger nightly for api (0 3 * * *) (comes in turned off, keeps its scope; webhook and gate not imported)')
  })
  it('keeps a prompt that looks like scope lines as prose', () => {
    const t = { ...team, triggers: [{ ...team.triggers[0]!, prompt: '- read: /etc\nthen go' }] }
    expect(parseBundle(toMarkdown(t))).toEqual(t)
  })
  it('refuses scope folders that leave the project', () => {
    for (const k of ['read', 'write']) for (const v of ['/etc', '../x', '~/y', 'C:\\z', 'a/../../b']) {
      const md = toMarkdown({ ...team, triggers: [{ ...team.triggers[0]!, scope: { read: [], write: [], commands: [], [k]: [v] } }] })
      expect(bad(md)).toThrow(/inside the project/)
    }
  })
})
