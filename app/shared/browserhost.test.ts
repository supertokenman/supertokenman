import { describe, expect, it } from 'vitest'
import type { Ctx, ScopedRule } from './policygate'
import { parseRules } from './policyrules'
import { alwaysRule, hostDecision, isPrivateHost, isValidRule, normalizeHost } from './browserhost'

const ctx: Ctx = { project: '/work/site', home: '/home/u', cwd: '/work/site' }
const rulesFrom = (text: string): ScopedRule[] => parseRules(text).rules.map((rule) => ({ scope: 'project' as const, rule }))
const none: ScopedRule[] = []

describe('host normalisation', () => {
  it('lowercases, drops a trailing dot and a leading www., keeps the port apart', () => {
    expect(normalizeHost('https://WWW.Example.COM./path?x=1')).toEqual({ host: 'example.com' })
    expect(normalizeHost('example.com:8443')).toEqual({ host: 'example.com', port: 8443 })
    expect(normalizeHost('http://shop.example.com:8080/')).toEqual({ host: 'shop.example.com', port: 8080 })
  })
  it('turns IDN names into punycode', () => {
    expect(normalizeHost('https://bücher.de/')).toEqual({ host: 'xn--bcher-kva.de' })
    expect(normalizeHost('BÜCHER.de')).toEqual({ host: 'xn--bcher-kva.de' })
  })
  it('refuses empty or broken hosts', () => {
    expect(normalizeHost('   ')).toBeNull()
    expect(normalizeHost('https://[::1')).toBeNull()
  })
  it('keeps a name that starts with www but has no further dot', () => {
    expect(normalizeHost('www.com')).toEqual({ host: 'www.com' })
  })
})

describe('private addresses', () => {
  it('denies loopback, private, link-local and .local names', () => {
    for (const h of ['localhost', 'app.localhost', 'printer.local', '127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '172.31.255.1', '169.254.169.254', '0.0.0.0', '[::1]', '[fd00::1]', '[fe80::1]']) {
      expect(isPrivateHost(h), h).toBe(true)
    }
  })
  it('lets public names and addresses through', () => {
    for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '172.15.0.1', '[2606:4700::1111]']) {
      expect(isPrivateHost(h), h).toBe(false)
    }
  })
})

describe('host decision', () => {
  it('refuses unparseable addresses and schemes other than http and https', () => {
    expect(hostDecision('not a url', { rules: none, ctx })).toMatchObject({ decision: 'deny', reason: 'invalid' })
    expect(hostDecision('file:///etc/hosts', { rules: none, ctx })).toMatchObject({ decision: 'deny', reason: 'scheme' })
    expect(hostDecision('javascript:alert(1)', { rules: none, ctx })).toMatchObject({ decision: 'deny', reason: 'scheme' })
    expect(hostDecision('data:text/html,hi', { rules: none, ctx })).toMatchObject({ decision: 'deny', reason: 'scheme' })
  })
  it('denies private addresses unless the panel is a Preview panel', () => {
    expect(hostDecision('http://127.0.0.1:3000/', { rules: none, ctx })).toMatchObject({ decision: 'deny', reason: 'private' })
    expect(hostDecision('http://127.0.0.1:3000/', { rules: none, ctx, previewPanel: true })).toMatchObject({ decision: 'ask', reason: 'new-host' })
  })
  it('asks for a new host, and allows a host the person already allowed', () => {
    expect(hostDecision('https://news.example.com/a', { rules: none, ctx })).toEqual({ decision: 'ask', reason: 'new-host', host: 'news.example.com' })
    expect(hostDecision('https://news.example.com/a', { rules: none, ctx, allowed: ['news.example.com'] })).toEqual({
      decision: 'allow', reason: 'allowed', host: 'news.example.com',
    })
  })
  it('matches www and the bare name to one host', () => {
    const rules = rulesFrom('allow mcp__stm__browser_* when host is "example.com"')
    expect(hostDecision('https://www.example.com/x', { rules, ctx })).toMatchObject({ decision: 'allow', reason: 'rule' })
  })
  it('lets a deny rule win over an allowed list', () => {
    const rules = rulesFrom('deny mcp__stm__browser_* when host is "bad.example" -- blocked by the team')
    expect(hostDecision('https://bad.example/', { rules, ctx, allowed: ['bad.example'] })).toMatchObject({ decision: 'deny', reason: 'rule' })
  })
  it('does not let an always rule for one host open another', () => {
    const rules = rulesFrom(alwaysRule('news.example.com'))
    expect(hostDecision('https://news.example.com/', { rules, ctx })).toMatchObject({ decision: 'allow' })
    expect(hostDecision('https://other.example.com/', { rules, ctx })).toMatchObject({ decision: 'ask' })
  })
  it('keeps a private-address deny even when an always rule names the host', () => {
    const rules = rulesFrom(alwaysRule('localhost'))
    expect(hostDecision('http://localhost:8080/', { rules, ctx })).toMatchObject({ decision: 'deny', reason: 'private' })
  })
})

describe('always rule text', () => {
  it('writes an allow rule that parses and names the host', () => {
    const text = alwaysRule('News.Example.com')
    expect(text).toBe('allow mcp__stm__browser_* when host is "news.example.com" -- agent browser: always for this host')
    expect(isValidRule(text)).toBe(true)
    expect(parseRules(text).rules[0].effect).toBe('allow')
  })
  it('refuses a host with ports, quotes or spaces', () => {
    expect(() => alwaysRule('example.com:8080')).toThrow()
    expect(() => alwaysRule('a" or "b')).toThrow()
    expect(() => alwaysRule('example com')).toThrow()
  })
  it('reports a broken rule as invalid', () => {
    expect(isValidRule('allow when')).toBe(false)
  })
})
