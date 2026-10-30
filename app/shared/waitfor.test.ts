import { describe, expect, it } from 'vitest'
import { parseTimeout, waitDone, waitOutcome, WAIT_DEFAULT_SEC, WAIT_MAX_SEC } from './waitfor'

describe('wait conditions', () => {
  it('blocked is met at once when already blocked', () => {
    expect(waitDone('blocked', { state: 'waiting_approval', turn: 0 }, 0)).toBe(true)
    expect(waitDone('blocked', { state: 'waiting_input', turn: 0 }, 0)).toBe(true)
    expect(waitDone('blocked', { state: 'error', turn: 0 }, 0)).toBe(true)
    expect(waitDone('blocked', { state: 'working', turn: 0 }, 0)).toBe(false)
    expect(waitDone('blocked', { state: 'idle', turn: 0 }, 0)).toBe(false)
  })

  it('idle is met at once when already idle, not otherwise', () => {
    expect(waitDone('idle', { state: 'idle', turn: 3 }, 3)).toBe(true)
    expect(waitDone('idle', { state: 'working', turn: 3 }, 3)).toBe(false)
    expect(waitDone('idle', { state: 'error', turn: 3 }, 3)).toBe(false)
  })

  it('done needs idle after a turn ended since the wait began', () => {
    expect(waitDone('done', { state: 'idle', turn: 4 }, 4)).toBe(false)
    expect(waitDone('done', { state: 'idle', turn: 5 }, 4)).toBe(true)
    expect(waitDone('done', { state: 'working', turn: 5 }, 4)).toBe(false)
    expect(waitDone('done', { state: 'waiting_input', turn: 5 }, 4)).toBe(false)
  })

  it('a closed panel meets done and is reported as closed for blocked and idle', () => {
    expect(waitDone('done', { state: 'closed', turn: 0 }, 9)).toBe(true)
    expect(waitOutcome('blocked', { state: 'closed', turn: 0 }, 0)).toBe('closed')
    expect(waitOutcome('idle', { state: 'closed', turn: 0 }, 0)).toBe('closed')
    expect(waitOutcome('blocked', { state: 'working', turn: 0 }, 0)).toBe('pending')
  })

  it('parses timeouts in s, m and h', () => {
    expect(parseTimeout('90s')).toBe(90)
    expect(parseTimeout('10m')).toBe(600)
    expect(parseTimeout('2h')).toBe(7200)
    expect(parseTimeout(' 5 m ')).toBe(300)
  })

  it('defaults to 10 minutes when no timeout is given', () => {
    expect(parseTimeout()).toBe(WAIT_DEFAULT_SEC)
    expect(parseTimeout('')).toBe(600)
  })

  it('caps timeouts at 24 hours', () => {
    expect(parseTimeout('24h')).toBe(WAIT_MAX_SEC)
    expect(parseTimeout('99h')).toBe(86400)
    expect(parseTimeout('2000m')).toBe(86400)
  })

  it('rejects malformed or non-positive timeouts', () => {
    expect(parseTimeout('0s')).toBeNull()
    expect(parseTimeout('10')).toBeNull()
    expect(parseTimeout('1.5m')).toBeNull()
    expect(parseTimeout('10d')).toBeNull()
    expect(parseTimeout('abc')).toBeNull()
  })
})
