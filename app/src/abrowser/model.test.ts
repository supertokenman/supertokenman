import { describe, expect, it } from 'vitest'
import { addressOf, cardText, fmtSize, scopeLabel, shortUrl, shownPanel, statusOf } from './model'
import type { Ask, PaneState } from './types'

const st = (panel: string, over: Partial<PaneState> = {}): PaneState => ({ panel, tabs: [{ id: 1, url: 'https://a.test/', title: 'A', loading: false }], active: 1, held: false, reason: '', stopped: '', scope: 'panel', step: 1, budget: { steps: 30, wallMs: 600000, screenshots: 10, newHosts: 5 }, ...over })

describe('which browser the pane shows', () => {
  it('prefers the focused panel when it has tabs', () => {
    expect(shownPanel({ a: st('a'), b: st('b') }, 'b', [], { a: 9, b: 1 })).toBe('b')
  })
  it('falls back to a panel with an ask, then to the latest change', () => {
    const ask: Ask = { id: '1', panel: 'a', kind: 'host', detail: { host: 'x.test', always: true } }
    expect(shownPanel({ a: st('a'), b: st('b') }, 'c', [ask], { b: 9 })).toBe('a')
    expect(shownPanel({ a: st('a'), b: st('b') }, null, [], { a: 1, b: 5 })).toBe('b')
  })
  it('shows nothing when no panel has a tab', () => {
    expect(shownPanel({ a: st('a', { tabs: [], active: null }) }, 'a', [], {})).toBeNull()
  })
})

describe('who is driving', () => {
  it('says the person has it, with the reason, and calls out a secret', () => {
    expect(statusOf(st('a', { held: true }), 'Shop', 100, 0).kind).toBe('held')
    const s = statusOf(st('a', { held: true, reason: 'sign-in' }), 'Shop', 100, 0)
    expect(s.kind).toBe('secret')
    expect(s.detail).toMatch(/never sees them/)
    expect(statusOf(st('a', { held: true, reason: 'captcha' }), 'Shop', 100, 0).kind).toBe('held')
  })
  it('says driving only shortly after a change, else idle; a stopped task says why', () => {
    expect(statusOf(st('a'), 'Shop', 1000, 500)).toMatchObject({ kind: 'driving', label: 'Shop is driving' })
    expect(statusOf(st('a'), 'Shop', 20000, 500).kind).toBe('idle')
    expect(statusOf(st('a', { stopped: 'blocked by the site' }), 'Shop', 20000, 500)).toMatchObject({ kind: 'stopped', detail: 'blocked by the site' })
  })
})

describe('ask cards', () => {
  it('offers Always only when the ask allows it', () => {
    const a: Ask = { id: '1', panel: 'a', kind: 'host', detail: { host: 'shop.test', always: true } }
    expect(cardText(a, 'Shop')).toMatchObject({ title: 'Open shop.test?', always: 'Always allow' })
    expect(cardText({ ...a, detail: { host: 'shop.test', always: false } }, 'Shop').always).toBeUndefined()
  })
  it('words downloads and uploads', () => {
    expect(cardText({ id: '1', panel: 'a', kind: 'download', detail: { host: 'h.test', name: 'r.pdf', size: 2048, always: false } }, 'S').body).toMatch(/r\.pdf \(2 KB\) from h\.test/)
    expect(cardText({ id: '1', panel: 'a', kind: 'upload', detail: { host: 'h.test', pick: true, always: false } }, 'S').yes).toBe('Choose a file')
    expect(cardText({ id: '1', panel: 'a', kind: 'upload', detail: { host: 'h.test', name: 'cv.pdf', size: 5, always: false } }, 'S').yes).toBe('Upload')
  })
})

describe('small helpers', () => {
  it('formats sizes, addresses and scopes', () => {
    expect(fmtSize(0)).toBe('')
    expect(fmtSize(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(shortUrl('https://shop.test/a?b=1')).toBe('shop.test/a?b=1')
    expect(addressOf(' shop.test/x ')).toBe('https://shop.test/x')
    expect(addressOf('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
    expect(scopeLabel('project', [])).toBe('Project profile')
    expect(scopeLabel('profile:x', [{ id: 'x', name: 'Admin' }])).toBe('Admin')
    expect(scopeLabel('panel', [])).toBe('This panel only')
  })
})
