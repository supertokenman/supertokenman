import { describe, expect, it } from 'vitest'
import { assembleSkill, brokenLinks, checkCanvas, checkFrontmatter, wikilinks } from './vaultcheck'

describe('vault checks', () => {
  it('frontmatter that parses passes, mistakes are named with their line', () => {
    expect(checkFrontmatter('---\ntitle: A\ntags:\n  - x\n  - y\nrelated: "[[B]]"\n---\nbody')).toEqual([])
    expect(checkFrontmatter('no frontmatter at all')).toEqual([])
    expect(checkFrontmatter('---\ntitle: A\nbody without end')).toEqual([{ line: 1, text: 'Frontmatter is not closed with ---.' }])
    expect(checkFrontmatter('---\ntitle: A\ntitle: B\nrelated: [[B]]\njust text\n---\n').map((p) => p.line)).toEqual([3, 4, 5])
    expect(checkFrontmatter('\n---\ntitle: A\n---')[0]!.text).toMatch(/first line/)
  })
  it('finds wikilinks, skipping code, file embeds, headings and aliases', () => {
    const md = 'See [[Plan#Goals|the goals]] and ![[img.png]] and [[Notes/Week 1]].\n```\n[[not a link]]\n```\n![[Spec]]'
    expect(wikilinks(md).map((l) => l.target)).toEqual(['Plan', 'Notes/Week 1', 'Spec'])
  })
  it('names broken links only', () => {
    expect(brokenLinks('[[plan]] [[Week 1]] [[Ghost]]', ['Plan.md', 'Notes/Week 1.md'])).toEqual([{ line: 1, text: '[[Ghost]] points at no note in the vault.' }])
  })
  it('checks a canvas like the spec', () => {
    const ok = JSON.stringify({ nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Hi\nthere' }, { id: 'b', type: 'link', x: 300, y: 0, width: 200, height: 100, url: 'https://x' }], edges: [{ id: 'e', fromNode: 'a', toNode: 'b', toEnd: 'arrow' }] })
    expect(checkCanvas(ok)).toEqual([])
    const bad = JSON.stringify({ nodes: [{ id: 'a', type: 'text', x: 0.5, y: 0, width: 200, height: 100, text: 'lit\\n' }, { id: 'a', type: 'card', x: 0, y: 0, width: 1, height: 1 }], edges: [{ id: 'e', fromNode: 'a', toNode: 'zz', fromSide: 'middle' }] })
    expect(checkCanvas(bad).length).toBe(6)
    expect(checkCanvas('{nope')[0]!.text).toMatch(/Not valid JSON/)
  })
  it('appends the reference files and points their links below', () => {
    const s = assembleSkill('See [CALLOUTS.md](references/CALLOUTS.md).', [{ file: 'CALLOUTS.md', text: '# Callouts Reference\n\nx' }], 'NOTE')
    expect(s).toBe('See CALLOUTS.md (below).\n\n---\n\n## Reference: Callouts Reference\n\nx\n\n---\n\nNOTE')
  })
})
