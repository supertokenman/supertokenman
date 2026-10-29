import { describe, expect, it } from 'vitest'
import { checkRoom, firstSpeaker, mentions, nextTurn, turnOrder, turnText } from './room'

const m = [{ sid: 'a', name: 'Build' }, { sid: 'b', name: 'Review Bot' }, { sid: 'c', name: 'Docs' }]

describe('room', () => {
  it('parses @names once, ignoring emails', () => {
    expect(mentions('@Build and @docs, then @build. mail me@x.com')).toEqual(['build', 'docs'])
    expect(mentions('no one')).toEqual([])
  })
  it('picks the named panel, exact before prefix', () => {
    expect(firstSpeaker('hey @docs look', m)).toBe('c')
    expect(firstSpeaker('@review-bot go', m)).toBe('b')
    expect(firstSpeaker('@rev go', m)).toBe('b')
    expect(firstSpeaker('@nobody @build', m)).toBe('a')
    expect(() => firstSpeaker('no name', m)).toThrow(/@build, @review-bot, @docs/)
  })
  it('orders turns from the first speaker, wrapping', () => {
    expect(turnOrder(m, 'b')).toEqual(['b', 'c', 'a'])
    expect(nextTurn(m, ['b'])).toEqual({ to: 'c', from: 'b' })
    expect(nextTurn(m, ['b', 'c'])).toEqual({ to: 'a', from: 'c' })
    expect(nextTurn(m, ['b', 'c', 'a'])).toBeNull()
    expect(nextTurn(m, [])).toBeNull()
  })
  it('checks the room is linked', () => {
    const ln = (x: string, y: string) => [x, y].sort().join() === 'a,b'
    expect(checkRoom(m.slice(0, 2), ln)).toBeNull()
    expect(checkRoom(m, ln)).toMatch(/Docs is not linked/)
    expect(checkRoom([m[0]!], ln)).toMatch(/two or more/)
  })
  it('builds the turn text', () => {
    expect(turnText(' q ', 'Build', '')).toContain('Reply from Build:\n(no reply yet)')
  })
})
