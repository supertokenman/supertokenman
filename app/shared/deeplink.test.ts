import { describe, expect, it } from 'vitest'
import { askText, linkInArgv, parseLink } from './deeplink'

describe('deep links', () => {
  it('reads the allowed actions', () => {
    expect(parseLink('supertokenman://open?path=/Users/me/code/acme/')).toEqual({ kind: 'open', path: '/Users/me/code/acme' })
    expect(parseLink('supertokenman://focus?panel=s3')).toEqual({ kind: 'focus', panel: 's3' })
    expect(parseLink('supertokenman://screen?id=prs')).toEqual({ kind: 'screen', id: 'prs' })
    expect(parseLink('supertokenman://pr?repo=acme/fan&number=12')).toEqual({ kind: 'pr', repo: 'acme/fan', number: 12 })
  })
  it('refuses the rest', () => {
    for (const bad of [
      'supertokenman://open?path=../../etc',
      'supertokenman://open?path=/Users/me/../../etc',
      'supertokenman://open?path=relative/dir',
      'supertokenman://run?cmd=rm%20-rf%20~',
      'supertokenman://screen?id=vault',
      'supertokenman://screen?id=settings',
      'supertokenman://focus?panel=s1;rm',
      'supertokenman://user:pass@open?path=/x',
      'supertokenman://pr?repo=a&number=1',
      'https://evil.example/open?path=/x',
      'supertokenman://open?path=/x\u0000y',
      `supertokenman://open?path=/${'a'.repeat(3000)}`,
    ]) expect('error' in parseLink(bad)).toBe(true)
  })
  it('finds the link in argv and words the question', () => {
    expect(linkInArgv(['/app', '--no-sandbox', 'supertokenman://focus?panel=s1'])).toBe('supertokenman://focus?panel=s1')
    expect(linkInArgv(['/app'])).toBeNull()
    expect(askText({ kind: 'open', path: '/w/acme' })).toBe('Open a panel in /w/acme?')
  })
})
