import { describe, expect, it } from 'vitest'
import { decodeInvite, encodeInvite, newInvite, open, seal, TeamRoom, tokenOf, type Entry, type Member } from './teamRoom'

const RELAY = process.env.STM_RELAY // e.g. http://localhost:8799 with `wrangler dev` running in team-relay

describe('team', () => {
  it('round-trips invites and refuses damaged ones', () => {
    const i = newInvite('https://relay.example.workers.dev/')
    expect(i.relay).toBe('https://relay.example.workers.dev')
    expect(decodeInvite(encodeInvite(i))).toEqual(i)
    expect(() => decodeInvite('hello')).toThrow()
    expect(() => decodeInvite('stm-team:' + btoa('{"relay":"javascript:x","room":"aaaaaaaaaaaaaaaa","key":"x"}'))).toThrow()
  })
  it('seals so only the key opens', async () => {
    const a = newInvite('https://r')
    const b = newInvite('https://r')
    const s = await seal(a.key, { kind: 'chat', name: 'yuji', text: 'segredo do projeto' })
    expect(s.data).not.toContain('segredo')
    expect(await open(a.key, s.iv, s.data)).toEqual({ kind: 'chat', name: 'yuji', text: 'segredo do projeto' })
    expect(await open(b.key, s.iv, s.data)).toBeNull()
    expect(await tokenOf(a.key)).toMatch(/^[a-f0-9]{64}$/)
  })
  it.runIf(RELAY)('two members talk through the real relay', async () => {
    const inv = newInvite(RELAY!)
    const got: Entry[] = []
    let seen: Member[] = []
    const a = new TeamRoom(inv, { id: 'member-aaa', name: 'Yuji' }, { onEntry: () => {}, onMembers: () => {}, onState: () => {} }, () => ({ repo: 'arimayuji/CLI', branch: 'main' }))
    const b = new TeamRoom(inv, { id: 'member-bbb', name: 'Colega' }, { onEntry: (e) => got.push(e), onMembers: (m) => (seen = m), onState: () => {} })
    await a.connect()
    await b.connect()
    await new Promise((r) => setTimeout(r, 800))
    await a.send({ kind: 'handoff', name: 'Yuji', title: 'Finish the Docker tab', text: 'logs work, exec left', repo: 'arimayuji/CLI', branch: 'main' })
    await new Promise((r) => setTimeout(r, 800))
    expect(got.some((e) => e.note.kind === 'handoff' && e.note.title === 'Finish the Docker tab')).toBe(true)
    expect(seen.some((m) => m.name === 'Yuji' && m.repo === 'arimayuji/CLI')).toBe(true)
    // a stranger with another key is turned away
    const bad = { ...newInvite(RELAY!), room: inv.room }
    let state = ''
    const c = new TeamRoom(bad, { id: 'member-ccc', name: 'x' }, { onEntry: () => {}, onMembers: () => {}, onState: (s) => (state = s) })
    await c.connect()
    await new Promise((r) => setTimeout(r, 800))
    expect(state).not.toBe('live')
    a.close(); b.close(); c.close()
  }, 15_000)
})
