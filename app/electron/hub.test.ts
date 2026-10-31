import { describe, expect, it } from 'vitest'
import { Hub, type Peer } from './hub'

/** A panel whose replies the test controls. */
function peer(label: string, reply: (text: string, from: string) => Promise<string>): Peer {
  return { label, cwd: `/${label}`, busy: () => false, ask: reply }
}

describe('Hub', () => {
  it('lists the other panels and routes a message to one, returning its reply', async () => {
    const hub = new Hub()
    const got: string[] = []
    hub.add('s1', peer('api', async () => ''))
    hub.add('s2', peer('web', async (t, from) => (got.push(`${from}: ${t}`), 'done, 3 files changed')))
    expect(hub.list('s1')).toEqual([{ panel: 's2', name: 'web', folder: '/web', busy: false }])
    expect(await hub.message('s1', 's2', 'update the client types')).toBe('done, 3 files changed')
    expect(got).toEqual(['api: update the client types'])
  })

  it('refuses unknown panels, itself, and a cycle that would deadlock', async () => {
    const hub = new Hub()
    let s2Asked: Promise<string> | null = null
    hub.add('s1', peer('a', async () => 'from a'))
    // s2, while answering s1, tries to message s1 back
    hub.add('s2', peer('b', async () => {
      s2Asked = hub.message('s2', 's1', 'and you?')
      return s2Asked.catch((e: Error) => e.message)
    }))
    await expect(hub.message('s1', 's9', 'x')).rejects.toThrow('No panel "s9"')
    await expect(hub.message('s1', 's1', 'x')).rejects.toThrow('cannot message itself')
    expect(await hub.message('s1', 's2', 'go')).toContain('would deadlock')
    // after the round trip nobody is left waiting: s2 can now reach s1
    expect(await hub.message('s2', 's1', 'hi')).toBe('from a')
  })
})

describe('a message that never starts', () => {
  it('fails fast when the target shows no sign of work, and calls onMessage first', async () => {
    const hub = new Hub()
    hub.startMs = 60
    const seen: string[] = []
    hub.onMessage = (f, t) => void seen.push(`${f}>${t}`)
    hub.add('a', { label: 'a', cwd: '/a', busy: () => false, ask: () => new Promise(() => undefined) })
    hub.add('b', { label: 'b', cwd: '/b', busy: () => false, ask: () => new Promise(() => undefined), lastSign: () => 0 })
    await expect(hub.message('a', 'b', 'hi')).rejects.toThrow(/did not start the task/)
    expect(seen).toEqual(['a>b'])
  })
  it('keeps waiting once the target shows a sign', async () => {
    const hub = new Hub()
    hub.startMs = 60
    let sign = 0
    hub.add('a', { label: 'a', cwd: '/a', busy: () => false, ask: () => new Promise(() => undefined) })
    hub.add('b', { label: 'b', cwd: '/b', busy: () => true, ask: () => ((sign = Date.now() + 1), new Promise((ok) => setTimeout(() => ok('done'), 150))), lastSign: () => sign })
    await expect(hub.message('a', 'b', 'hi')).resolves.toBe('done')
  })
})
