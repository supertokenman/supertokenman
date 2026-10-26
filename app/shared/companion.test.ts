import { describe, expect, it } from 'vitest'
import { authed, MAX_TRIES, newPairing, openPairing, page, panelView, PAIR_MS, same, tryPair } from './companion'

const tok = 'a'.repeat(32)
describe('pairing', () => {
  it('pairs once with the right code, then the code is spent', () => {
    const p = newPairing()
    const code = openPairing(p, 0, () => 0.042)
    expect(code).toBe('042000')
    expect(tryPair(p, '042000', 1000, tok, 'iPhone')).toEqual({ ok: true, token: tok })
    expect(authed(p, `Bearer ${tok}`)).toBe(true)
    expect(tryPair(p, '042000', 2000, 'b'.repeat(32), 'x').ok).toBe(false)
  })
  it('expires and locks after five wrong tries', () => {
    const p = newPairing()
    openPairing(p, 0, () => 0.5)
    expect(tryPair(p, '500000', PAIR_MS + 1, tok, '')).toMatchObject({ ok: false })
    openPairing(p, 0, () => 0.5)
    for (let i = 0; i < MAX_TRIES; i++) expect(tryPair(p, '111111', 1, tok, '').ok).toBe(false)
    expect(tryPair(p, '500000', 2, tok, '').ok).toBe(false)
    expect(authed(p, `Bearer ${tok}`)).toBe(false)
  })
  it('refuses bad headers', () => {
    const p = newPairing()
    expect(authed(p, undefined)).toBe(false)
    expect(authed(p, 'Bearer short')).toBe(false)
    expect(same('abc', 'abd')).toBe(false)
  })
})

describe('panelView', () => {
  it('shows the folder name and the tail of the reply', () => {
    const v = panelView({ id: 's1', cwd: '/Users/me/code/acme', busy: true, goal: null }, 'x'.repeat(900), [{ id: 'p1', tool: 'Bash', summary: 'npm test', risk: 'low' }])
    expect(v.name).toBe('acme')
    expect(v.reply.length).toBe(803)
    expect(v.asks).toEqual([{ id: 'p1', tool: 'Bash', summary: 'npm test', risk: 'low' }])
  })
})

describe('page', () => {
  it('loads nothing from outside', () => {
    expect(page()).not.toMatch(/src="http|href="http/)
  })
})
