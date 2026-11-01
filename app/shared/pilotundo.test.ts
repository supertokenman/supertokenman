import { describe, expect, it } from 'vitest'
import { UndoStack, UNDO_CAP, type Action } from './pilotundo'

const act = (id: string, over: Partial<Action> = {}): Action => ({ id, at: 0, panel: 'p1', command: 'layout-grid', title: 'Grid', undo: { kind: 'layout', prev: 'auto' }, after: 'grid', ...over })

describe('UndoStack push and list', () => {
  it('lists newest first', () => {
    const s = new UndoStack()
    s.push(act('a')); s.push(act('b'))
    expect(s.list().map((x) => x.id)).toEqual(['b', 'a'])
  })
  it('caps at 100 and drops the oldest', () => {
    const s = new UndoStack()
    for (let i = 0; i < UNDO_CAP + 5; i++) s.push(act(`a${i}`))
    expect(s.size).toBe(100)
    expect(s.list().at(-1)?.id).toBe('a5')
    expect(s.list()[0]?.id).toBe(`a${UNDO_CAP + 4}`)
  })
})

describe('plan: inverse per kind', () => {
  it('returns the layout inverse', () => {
    const s = new UndoStack()
    s.push(act('a'))
    expect(s.plan('a', 'grid')).toEqual({ ok: true, inverse: { kind: 'layout', prev: 'auto' } })
  })
  it('returns the panels inverse', () => {
    const s = new UndoStack()
    s.push(act('p', { undo: { kind: 'panels', closed: ['s9'] }, after: undefined }))
    expect(s.plan('p')).toEqual({ ok: true, inverse: { kind: 'panels', closed: ['s9'] } })
  })
  it('returns the setting inverse', () => {
    const s = new UndoStack()
    s.push(act('s', { undo: { kind: 'setting', key: 'headroom', prev: false }, after: true }))
    expect(s.plan('s', true)).toEqual({ ok: true, inverse: { kind: 'setting', key: 'headroom', prev: false } })
  })
  it('returns the routine inverse', () => {
    const s = new UndoStack()
    s.push(act('r', { undo: { kind: 'routine', id: 'r1', prevEnabled: false }, after: true }))
    expect(s.plan('r', true)).toEqual({ ok: true, inverse: { kind: 'routine', id: 'r1', prevEnabled: false } })
  })
})

describe('plan refusals', () => {
  it('refuses an unknown action', () => {
    expect(new UndoStack().plan('nope')).toEqual({ ok: false, reason: 'missing' })
  })
  it('refuses an irreversible action with "irreversible"', () => {
    const s = new UndoStack()
    s.push(act('x', { undo: null, irreversible: true, after: undefined }))
    expect(s.plan('x')).toEqual({ ok: false, reason: 'irreversible' })
  })
  it('refuses an action with no inverse that is not irreversible', () => {
    const s = new UndoStack()
    s.push(act('n', { undo: null, after: undefined }))
    expect(s.plan('n')).toEqual({ ok: false, reason: 'none' })
  })
  it('refuses when the person changed the value since ("changed since")', () => {
    const s = new UndoStack()
    s.push(act('a'))
    expect(s.plan('a', 'auto')).toEqual({ ok: false, reason: 'changed' })
  })
  it('skips the changed check when the action recorded no after value', () => {
    const s = new UndoStack()
    s.push(act('a', { after: undefined }))
    expect(s.plan('a', 'anything').ok).toBe(true)
  })
})

describe('take', () => {
  it('removes an undone action', () => {
    const s = new UndoStack()
    s.push(act('a'))
    expect(s.take('a', 'grid').ok).toBe(true)
    expect(s.size).toBe(0)
  })
  it('keeps an action whose undo was refused', () => {
    const s = new UndoStack()
    s.push(act('a'))
    expect(s.take('a', 'auto').ok).toBe(false)
    expect(s.size).toBe(1)
  })
})
