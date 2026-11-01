import { describe, expect, it } from 'vitest'
import { MAIN_MODELS } from '../../shared/models'
import type { PilotAction } from '../bridge'
import { ago, lastUndoable, parseCard, reasonText, smallestModel } from './logic'

const act = (over: Partial<PilotAction>): PilotAction => ({ id: 'a1', at: 0, panel: 's1', command: 'layout-grid', title: 'Change the layout', undo: 'layout', irreversible: false, ...over })

describe('smallestModel', () => {
  it('is the cheapest model by input price', () => {
    const cheapest = [...MAIN_MODELS].sort((a, b) => a.price.input - b.price.input)[0]!
    expect(smallestModel().id).toBe(cheapest.id)
    expect(smallestModel().family).toBe('haiku')
  })
})

describe('parseCard', () => {
  it('reads title, args and tier', () => {
    expect(parseCard('Pilot: Open a panel in a recent folder (cwd=/work/acme) [ask]')).toEqual({ title: 'Open a panel in a recent folder', args: [{ key: 'cwd', value: '/work/acme' }], tier: 'ask', irreversible: false })
  })
  it('keeps commas inside a value', () => {
    expect(parseCard('Pilot: X (a=1, 2, b=3) [ask]')?.args).toEqual([{ key: 'a', value: '1, 2' }, { key: 'b', value: '3' }])
  })
  it('knows irreversible and no args', () => {
    expect(parseCard('Pilot: Kill it [confirm]. This cannot be undone.')).toEqual({ title: 'Kill it', args: [], tier: 'confirm', irreversible: true })
  })
  it('is null for any other ask', () => {
    expect(parseCard('npm test')).toBeNull()
  })
})

describe('actions list', () => {
  it('undo last skips entries with no inverse and irreversible ones', () => {
    const list = [act({ id: 'a3', undo: null }), act({ id: 'a2', irreversible: true }), act({ id: 'a1' })]
    expect(lastUndoable(list)?.id).toBe('a1')
    expect(lastUndoable([act({ undo: null })])).toBeUndefined()
  })
  it('says why an undo was refused', () => {
    expect(reasonText('changed')).toMatch(/Changed since/)
    expect(reasonText('irreversible')).toMatch(/cannot be undone/)
    expect(reasonText(undefined)).toMatch(/Could not/)
  })
  it('times in plain words', () => {
    expect(ago(1000, 2000)).toBe('just now')
    expect(ago(0, 30_000)).toBe('30 s ago')
    expect(ago(0, 5 * 60_000)).toBe('5 min ago')
    expect(ago(0, 3 * 3600_000)).toBe('3 h ago')
  })
})
