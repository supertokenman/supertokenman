import { describe, expect, it } from 'vitest'
import { cleanPrefs, Gate, GRACE_MS, passwordPrompt } from './lock'

describe('Gate', () => {
  it('holds an unlock for the grace period, then locks the secrets again', () => {
    let t = 1_000_000
    const g = new Gate(() => ({ onOpen: false, idleMin: 0, secrets: true }), () => t)
    expect(g.secretsOpen()).toBe(false)
    expect(() => g.guard()).toThrow(/Locked/)
    g.unlocked()
    expect(g.secretsOpen()).toBe(true)
    t += GRACE_MS + 1
    expect(g.secretsOpen()).toBe(false)
    g.unlocked()
    g.lock()
    expect(g.secretsOpen()).toBe(false)
  })
  it('never asks when the option is off', () => {
    expect(new Gate(() => ({ onOpen: true, idleMin: 5, secrets: false })).secretsOpen()).toBe(true)
  })
  it('keeps only known idle times', () => {
    expect(cleanPrefs({ idleMin: 7 as number, onOpen: 1 as unknown as boolean })).toEqual({ onOpen: true, idleMin: 0, secrets: false })
  })
})

describe('passwordPrompt', () => {
  it('asks macOS for the password without letting the reason break out of the script', () => {
    const [cmd, args] = passwordPrompt('unlock "x" \\ now')
    expect(cmd).toBe('/usr/bin/osascript')
    expect(args[1]).toBe('do shell script "/usr/bin/true" with prompt "SuperTokenMan wants to unlock x  now." with administrator privileges')
  })
})
