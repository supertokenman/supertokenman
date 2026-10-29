import { describe, expect, it } from 'vitest'
import { evergreenPrompt, parseEvergreen, parseRewrite, parseTriage, rewritePrompt, triagePrompt } from './socialprompts'

const fence = (s: string) => '```json\n' + s + '\n```'

describe('rewrite (F3)', () => {
  it('prompt asks for strict JSON and names each network', () => {
    const p = rewritePrompt('Hello', ['x', 'mastodon'])
    expect(p).toMatch(/strict JSON/)
    expect(p).toContain('"x"')
    expect(p).toContain('"mastodon"')
  })

  it('parses fenced JSON into one text per network', () => {
    const r = parseRewrite(fence('{"x":"short one","mastodon":"a longer version"}'), { text: 'orig' }, ['x', 'mastodon'])
    expect(r).toEqual({ ok: true, value: { texts: { x: 'short one', mastodon: 'a longer version' }, rejected: {} } })
  })

  it('rejects a version that fails problem() and keeps the reason', () => {
    const long = 'a'.repeat(281)
    const r = parseRewrite(JSON.stringify({ x: long, mastodon: 'ok' }), { text: 'orig' }, ['x', 'mastodon'])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.texts).toEqual({ mastodon: 'ok' })
    expect(r.value.rejected.x).toMatch(/280/)
  })

  it('checks the link length as problem() does', () => {
    const r = parseRewrite(JSON.stringify({ x: 'a'.repeat(270) }), { text: 'orig', link: 'https://example.com/abcdefghij' }, ['x'])
    expect(r.ok && r.value.rejected.x).toMatch(/280/)
  })

  it('rejects missing and unknown networks without throwing', () => {
    const r = parseRewrite(JSON.stringify({ x: '' }), { text: 'orig' }, ['x', 'bluesky', 'nope' as never])
    expect(r.ok && r.value.texts).toEqual({})
    expect(r.ok && Object.keys(r.value.rejected)).toEqual(['x', 'bluesky', 'nope'])
  })

  it('returns an error value for non-JSON and for arrays', () => {
    expect(parseRewrite('sorry, I cannot', {}, ['x']).ok).toBe(false)
    expect(parseRewrite('["x"]', {}, ['x']).ok).toBe(false)
  })
})

describe('evergreen (F4)', () => {
  it('prompt asks for strict JSON and forbids time-bound words', () => {
    const p = evergreenPrompt('Launch today!', 'x')
    expect(p).toMatch(/strict JSON/)
    expect(p).toMatch(/today/)
  })

  it('parses fenced JSON and checks it with problem()', () => {
    expect(parseEvergreen(fence('{"text":"Still useful."}'), {}, 'x')).toEqual({ ok: true, value: { text: 'Still useful.' } })
    const r = parseEvergreen(JSON.stringify({ text: 'a'.repeat(300) }), {}, 'x')
    expect(r).toEqual({ ok: false, error: 'Over 280 characters for X.' })
  })

  it('returns an error when text is missing', () => {
    expect(parseEvergreen('{}', {}, 'x').ok).toBe(false)
    expect(parseEvergreen('not json', {}, 'x').ok).toBe(false)
  })
})

describe('triage (F5)', () => {
  const ids = ['m1', 'm2', 'm3']

  it('prompt lists the five labels and each id', () => {
    const p = triagePrompt([{ id: 'm1', text: 'hi' }, { id: 'm2', text: 'yo' }])
    for (const l of ['question', 'bug', 'praise', 'spam', 'needs-you']) expect(p).toContain(l)
    expect(p).toContain('m1')
    expect(p).toMatch(/strict JSON/)
  })

  it('accepts the five labels inside a fence', () => {
    const r = parseTriage(fence('{"m1":"question","m2":"bug","m3":"needs-you"}'), ids)
    expect(r).toEqual({ ok: true, value: { labels: { m1: 'question', m2: 'bug', m3: 'needs-you' }, rejected: [] } })
  })

  it('rejects unknown and missing labels', () => {
    const r = parseTriage('{"m1":"spam","m2":"bug report","m3":"needs you"}', ids)
    expect(r).toEqual({ ok: true, value: { labels: { m1: 'spam' }, rejected: ['m2', 'm3'] } })
  })

  it('returns an error for non-JSON output', () => {
    expect(parseTriage('here you go', ids).ok).toBe(false)
  })
})

import { accountRewritePrompt, hookPrompt, nichePrompt, parseAccountRewrite, parseHooks, parseNiche } from './socialprompts'
import { BUILTIN_FORMATS } from './hookfmt'
import { EMPTY_BRAND_KIT } from './brandkit'

describe('growth prompts (H8)', () => {
  const kit = { ...EMPTY_BRAND_KIT, tone: 'dry', bannedWords: ['synergy'] }
  const when = BUILTIN_FORMATS.find((f) => f.id === 'when')!
  it('hook prompt carries the brand kit and the topic as content', () => {
    const p = hookPrompt(when, 'my cat', kit)
    expect(p).toContain('Tone: dry')
    expect(p).toContain('<topic>')
    expect(p).toMatch(/strict JSON/)
  })
  it('parseHooks fills the template and drops repeats and banned words', () => {
    const r = parseHooks(JSON.stringify({ slots: ['your cat sits', 'Your cat sits', 'synergy wins', '', 5] }), when, kit)
    expect(r).toEqual({ ok: true, value: { hooks: ['When your cat sits'], rejected: ['Your cat sits', 'synergy wins', '', ''] } })
    expect(parseHooks('nope', when, kit).ok).toBe(false)
    expect(parseHooks('{"slots":"x"}', when, kit).ok).toBe(false)
  })
  it('niche classify keeps known labels only', () => {
    expect(nichePrompt([{ id: 'a', text: 'Facts: x' }])).toContain('"sendto"')
    const r = parseNiche('{"a":"facts","b":"weird"}', ['a', 'b', 'c'])
    expect(r).toEqual({ ok: true, value: { labels: { a: 'facts' }, rejected: ['b', 'c'] } })
  })
  it('per-account rewrite: several accounts on one network never get identical text', () => {
    const accts = [{ id: 'x:ana', kit }, { id: 'x:bob' }, { id: 'x:cy' }]
    expect(accountRewritePrompt('Ship it', 'x', accts)).toContain('"x:bob"')
    const raw = JSON.stringify({ 'x:ana': 'We shipped.', 'x:bob': ' we  shipped. ', 'x:cy': 'Ship it' })
    const r = parseAccountRewrite(raw, { text: 'Ship it' }, 'x', accts)
    expect(r.ok && r.value.texts).toEqual({ 'x:ana': 'We shipped.' })
    expect(r.ok && r.value.rejected).toEqual({ 'x:bob': 'Same text as another account.', 'x:cy': 'Same text as another account.' })
    const ok = parseAccountRewrite(JSON.stringify({ 'x:ana': 'A', 'x:bob': 'B', 'x:cy': 'synergy' }), { text: 'Ship it' }, 'x', accts)
    expect(ok.ok && Object.keys(ok.value.texts)).toEqual(['x:ana', 'x:bob', 'x:cy'])
  })
})
