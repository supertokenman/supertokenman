import { describe, expect, it } from 'vitest'
import { typoVars } from './typography'

describe('typography', () => {
  it('maps roles, hexes and clamps sizes', () => {
    const v = typoVars({ font: 'serif', size: 40, claudeColor: 'muted', youBubble: '#112233' })
    expect(v['--msg-size']).toBe('20px')
    expect(v['--msg-font']).toContain('Georgia')
    expect(v['--msg-claude']).toBe('var(--muted)')
    expect(v['--msg-you-bg']).toBe('#112233')
  })
  it('falls back on unknown values', () => {
    const v = typoVars({ font: 'comic', size: Number.NaN, youColor: 'url(x)' })
    expect(v['--msg-size']).toBe('13.5px')
    expect(v['--msg-font']).toContain('sans-serif')
    expect(v['--msg-you']).toBe('var(--text)')
  })
})
