import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { initialLife, reduceLife } from '../shared/lifecycle.js'
import { launchFacts, readMarker, writeMarker } from './runmarker.js'
import { trayItems, trayTitle, type TrayInput } from './tray.js'

const file = () => join(mkdtempSync(join(tmpdir(), 'stm-marker-')), 'run.json')

describe('run marker', () => {
  it('no marker is a first run: clean, nothing to offer', () => {
    expect(launchFacts(readMarker(file()))).toEqual({ cleanExit: true, layoutPanels: 0 })
  })
  it('a marker left as running means the last run ended badly and offers its panels', () => {
    const f = file()
    writeMarker(f, { status: 'running', panels: 3, at: 1 })
    const facts = launchFacts(readMarker(f))
    expect(facts).toEqual({ cleanExit: false, layoutPanels: 3 })
    const [s] = reduceLife(initialLife(), { type: 'launch', ...facts })
    expect(s.resumeOffer).toBe(3)
  })
  it('clean and interrupted (update) markers', () => {
    const f = file()
    writeMarker(f, { status: 'clean', panels: 2, at: 1 })
    const [a] = reduceLife(initialLife(), { type: 'launch', ...launchFacts(readMarker(f)) })
    expect(a.resumeOffer).toBe(0)
    writeMarker(f, { status: 'interrupted', panels: 2, at: 1 })
    const [b] = reduceLife(initialLife(), { type: 'launch', ...launchFacts(readMarker(f)) })
    expect(b.resumeOffer).toBe(2)
  })
  it('a corrupt marker offers nothing', () => {
    const f = file()
    writeFileSync(f, '{"status":')
    expect(readMarker(f)).toBeNull()
    writeFileSync(f, JSON.stringify({ status: 'weird', panels: 4 }))
    expect(readMarker(f)).toBeNull()
  })
})

describe('tray', () => {
  const view = (panel: string, name: string, state: TrayInput['panels'][number]['state']) => ({ panel, name, state, since: 0, turn: 0, pending: 0 })
  it('title shows running count and cost, plus how many need you', () => {
    const i: TrayInput = { panels: [view('s1', 'api', 'working'), view('s2', 'web', 'waiting_approval'), view('s3', 'db', 'idle')], todayUsd: 1.423, background: true, needsYou: 1 }
    expect(trayTitle(i)).toBe('2 running  $1.42 today  1 needs you')
  })
  it('no title when nothing runs and the app is in front', () => {
    expect(trayTitle({ panels: [view('s1', 'api', 'idle')], todayUsd: 0, background: false, needsYou: 0 })).toBe('')
  })
  it('menu always has Open, Stop all and Quit and stop all', () => {
    const items = trayItems({ panels: [view('s1', 'api', 'working')], todayUsd: 0, background: true, needsYou: 0 })
    expect(items.map((x) => x.action).filter(Boolean)).toEqual(['open', 'stop-all', 'quit-and-stop'])
    expect(items[0]!.label).toBe('api: working')
  })
})
