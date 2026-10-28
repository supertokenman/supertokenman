import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script, no types
import * as L from './perf-lib.mjs'

describe('Mac performance run', () => {
  it('takes the median, leaving out runs that gave no number', () => {
    expect(L.median([300, 100, 200])).toBe(200)
    expect(L.median([4, 1, 3, 2])).toBe(2.5)
    expect(L.median([undefined, 5])).toBe(5)
    expect(L.median([])).toBe(null)
  })

  it('sums CPU and memory of the app and every process under it, not its siblings', () => {
    const ps = ['  10     1  2.0  102400', '  11    10  1.5   51200', '  12    11  0.5   10240', '  20     1 50.0  999999', 'garbage'].join('\n')
    const u = L.treeUsage(L.parsePs(ps), 10)
    expect(u.processes).toBe(3)
    expect(u.cpu).toBeCloseTo(4)
    expect(u.rssMb).toBeCloseTo(160)
  })

  it('finds the files index.html loads at start', () => {
    const html = '<script type="module" crossorigin src="./assets/index-abc.js"></script><link rel="modulepreload" crossorigin href="./assets/vendor-def.js"><link rel="stylesheet" crossorigin href="./assets/index-1.css"><link rel="icon" href="./icon.png"><script src="https://x.example/a.js"></script>'
    expect(L.startupChunks(html).sort()).toEqual(['assets/index-1.css', 'assets/index-abc.js', 'assets/vendor-def.js'])
  })

  it('turns two metric readings into per second rates', () => {
    const a = L.metricsMap({ metrics: [{ name: 'LayoutCount', value: 10 }, { name: 'RecalcStyleCount', value: 40 }] })
    const b = L.metricsMap({ metrics: [{ name: 'LayoutCount', value: 13 }, { name: 'RecalcStyleCount', value: 100 }] })
    expect(L.perSecond(a, b, 30)).toEqual({ layoutsPerS: 0.1, recalcsPerS: 2 })
  })

  it('compares with the previous release and marks changes over 10%', () => {
    const prev = { results: { launch: { composerMs: 1000, composerAll: [1, 2] }, idle: { four: { cpu: 0 } }, size: { dmgMb: 100 } } }
    const cur = { results: { launch: { composerMs: 1050 }, idle: { four: { cpu: 2 } }, size: { dmgMb: 80, appMb: 5 } } }
    const c = L.compare(prev, cur)
    const by = Object.fromEntries(c.map((x: { key: string }) => [x.key, x]))
    expect(Object.keys(by).sort()).toEqual(['idle.four.cpu', 'launch.composerMs', 'size.dmgMb'])
    expect(by['launch.composerMs'].marked).toBe(false)
    expect(by['size.dmgMb'].marked).toBe(true)
    expect(by['size.dmgMb'].change).toBeCloseTo(-0.2)
    expect(by['idle.four.cpu'].change).toBe(Infinity)
    const md = L.render({ version: '0.1.8', system: 'macOS 15', chip: 'Apple M1', runner: 'r', date: 'now', results: full() }, c, '0.1.7')
    expect(md).toContain('## Against 0.1.7')
    expect(md).toContain('| **size.dmgMb** | 100.00 | 80.00 | **-20%** |')
    expect(md).toContain('| launch.composerMs | 1000.00 | 1050.00 | +5% |')
  })

  it('leaves out a section measured another way, and says so', () => {
    const prev = { version: '0.1.11', results: { launch: { runs: 5, composerMs: 3000 }, size: { dmgMb: 100 } } }
    const launch = { method: 2, runs: 7, coldRuns: 2, windowMs: 1500, windowMin: 1300, windowMax: 1900, composerMs: 2000, composerMin: 1800, composerMax: 2500, coldWindowMs: 5000, coldComposerMs: 7000 }
    const cur = { version: '0.1.12', system: 'macOS', chip: 'c', runner: 'r', date: 'now', results: { ...full(), launch } }
    expect(L.changedMethod(prev, cur)).toEqual(['launch'])
    const c = L.compare(prev, cur)
    expect(c.map((x: { key: string }) => x.key)).toEqual(['size.dmgMb'])
    const md = L.render(cur, c, '0.1.11', prev)
    expect(md).toContain('not compared: launch')
    expect(md).toContain('| Launch to composer usable (median) | 2000 ms (1800 to 2500) |')
    expect(md).toContain('5000 / 7000 ms')
  })

  it('says when there is nothing to compare with', () => {
    const md = L.render({ version: '0.1.8', system: 'macOS', chip: 'c', runner: 'r', date: 'now', results: full() }, [], undefined)
    expect(md).toMatch(/Launch to composer usable \(median\) \| 900 ms/)
    expect(md).toContain('No perf.json on the previous release')
  })
})

function full() {
  const idle = { layoutsPerS: 0, recalcsPerS: 0, cpu: 0.5, rssMb: 400 }
  return { launch: { runs: 5, windowMs: 500, composerMs: 900 }, idle: { one: idle, four: { ...idle, rssMb: 700 }, perPanelMb: 100 }, typing: { longestFrameMs: 20, framesOver16: 2, longestInputMs: 24 }, size: { distKb: 3000, startupGzipKb: 600, appMb: 400, dmgMb: 150 } }
}
