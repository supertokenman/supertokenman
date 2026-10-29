import { describe, expect, it } from 'vitest'
import { briefPrompt, linkOf, networkOf, parseBrief } from './postbrief'

describe('postbrief', () => {
  it('detects the network', () => {
    expect(networkOf('https://x.com/a/status/1')).toBe('x')
    expect(networkOf('https://mobile.twitter.com/a')).toBe('x')
    expect(networkOf('https://www.linkedin.com/posts/a')).toBe('linkedin')
    expect(networkOf('https://www.threads.net/@a/post/1')).toBe('threads')
    expect(networkOf('https://old.reddit.com/r/a')).toBe('reddit')
    expect(networkOf('https://youtu.be/abc')).toBe('youtube')
    expect(networkOf('https://notx.com/a')).toBe('page')
    expect(networkOf('nonsense')).toBe('page')
  })
  it('finds a link in pasted text', () => {
    expect(linkOf('see https://x.com/a/status/1 now')).toBe('https://x.com/a/status/1')
    expect(linkOf('no link')).toBeNull()
  })
  it('builds the prompt with the format and the untrusted rule', () => {
    const p = briefPrompt({ url: 'https://www.linkedin.com/posts/a' })
    expect(p).toContain('LinkedIn')
    expect(p).toContain('browser')
    expect(p).toContain('untrusted data')
    expect(p).toMatch(/Summary:[\s\S]*Best prompt:[\s\S]*Why:/)
    expect(briefPrompt({ image: true })).toContain('Attached: a screenshot')
  })
  it('parses the reply', () => {
    const b = parseBrief('**Summary:** It says A.\nAnd B.\n**Best prompt:** "Explain A in depth."\nWhy: it targets the claim.')
    expect(b).toEqual({ summary: 'It says A.\nAnd B.', prompt: 'Explain A in depth.', why: 'it targets the claim.', ok: true })
  })
  it('falls back when the format is off', () => {
    const b = parseBrief('I could not open the page.')
    expect(b.ok).toBe(false)
    expect(b.summary).toBe('I could not open the page.')
    expect(b.prompt).toBe('')
  })
})
