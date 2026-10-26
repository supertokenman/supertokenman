import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { checkIcon, offAngle, straightSegments } from '../shared/iconcheck'
import * as Icons from './icons'

const all = Object.entries(Icons).filter(([n]) => n.startsWith('Icon')) as [string, () => JSX.Element][]

describe('icon rules', () => {
  it('reads straight segments, relative and absolute', () => {
    expect(straightSegments('M2 2h4v4l-4-4z')).toEqual([[2, 2, 6, 2], [6, 2, 6, 6], [6, 6, 2, 2]])
    expect(offAngle([0, 0, 4, 4])).toBe(0)
    expect(offAngle([0, 0, 4, 2])).toBeCloseTo(18.43, 1)
  })
  it('a bad icon fails each rule', () => {
    const bad = '<svg viewBox="0 0 24 24" stroke="red" stroke-width="2"><path d="M0 0L10 3M20 1h2" fill="#ff0000"/></svg>'
    expect(new Set(checkIcon(bad).map((f) => f.rule))).toEqual(new Set(['viewbox', 'stroke', 'colour', 'angle', 'bounds']))
  })
  it('a good icon passes', () => {
    expect(checkIcon('<svg viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5"><path d="M2 2h12v12H2zM2 2l4 4"/></svg>')).toEqual([])
  })
  it('every app icon keeps the box, the stroke and no fixed colours', () => {
    const report = all.map(([n, C]) => [n, checkIcon(renderToStaticMarkup(<C />)).filter((f) => f.rule !== 'angle')] as const).filter(([, f]) => f.length)
    expect(report).toEqual([])
  })
  it('lines off 45° stay at or under today’s count', () => {
    const off = all.flatMap(([n, C]) => checkIcon(renderToStaticMarkup(<C />)).filter((f) => f.rule === 'angle').map((f) => `${n}: ${f.detail}`))
    console.log(`${off.length} lines off 45°`)
    expect(off.length).toBeLessThanOrEqual(ANGLE_CEILING)
  })
})
const ANGLE_CEILING = 71
