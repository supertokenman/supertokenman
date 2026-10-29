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
