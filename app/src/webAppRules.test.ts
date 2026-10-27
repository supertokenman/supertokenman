import { describe, expect, it } from 'vitest'
import { allows, appOfPartition, iconHref, isAppPage, siteApp, unreadOf, validateSite, WEB_APPS } from '../shared/webapps'

const app = (id: string) => WEB_APPS.find((a) => a.id === id)!

describe('web apps', () => {
  it('reads unread counts from titles', () => {
    expect(unreadOf('(3) WhatsApp')).toBe(3)
    expect(unreadOf('Inbox (128) - me@gmail.com - Gmail')).toBe(128)
    expect(unreadOf('YouTube')).toBe(0)
  })
  it('holds each app to its own sites', () => {
    expect(allows(app('whatsapp'), 'https://web.whatsapp.com/')).toBe(true)
    expect(allows(app('whatsapp'), 'https://evilwhatsapp.com/')).toBe(false)
    expect(allows(app('gmail'), 'https://accounts.google.com/signin')).toBe(true)
    expect(allows(app('gmail'), 'http://mail.google.com/')).toBe(false)
    expect(allows(app('outlook'), 'https://login.microsoftonline.com/x')).toBe(true)
    expect(allows(app('youtube'), 'https://www.youtube.com/watch?v=x')).toBe(true)
    expect(allows(app('youtube'), 'https://example.com/')).toBe(false)
    expect(allows(app('x'), 'https://pbs.twimg.com/a.jpg')).toBe(true)
    expect(allows(app('reddit'), 'https://old.reddit.com/r/node')).toBe(true)
    expect(allows(app('ifood'), 'https://www.ifood.com.br/delivery')).toBe(true)
  })
  it('finds the app of a partition', () => {
    expect(appOfPartition('persist:gmail')?.name).toBe('Gmail')
    expect(appOfPartition('preview')).toBeUndefined()
  })
})

describe('isAppPage', () => {
  const outlook = WEB_APPS.find((a) => a.id === 'outlook')!
  it('hands the inbox back, keeps sign-in pages in the popup', () => {
    expect(isAppPage(outlook, 'https://outlook.office.com/mail/')).toBe(true)
    expect(isAppPage(outlook, 'https://login.microsoftonline.com/common/oauth2')).toBe(false)
    expect(isAppPage(outlook, 'https://outlook.live.com/owa/?nlp=1&login_hint=x')).toBe(false)
    expect(isAppPage(outlook, 'https://evil.com/mail')).toBe(false)
  })
})

describe('sites added as apps', () => {
  it('checks the address, name and extras', () => {
    const s = validateSite({ name: 'Linear', url: 'https://www.linear.app/team', alsoHosts: 'accounts.google.com, *.auth0.com' })
    expect(s).toMatchObject({ id: 'site-linear', url: 'https://www.linear.app/team', hosts: ['linear.app', 'accounts.google.com', 'auth0.com'], custom: true })
    expect(() => validateSite({ name: 'X', url: 'http://linear.app' })).toThrow(/https/)
    expect(() => validateSite({ name: 'X', url: 'https://user:pw@linear.app' })).toThrow(/login/)
    expect(() => validateSite({ name: 'X', url: 'https://192.168.0.1/' })).toThrow(/IP/)
    expect(() => validateSite({ name: 'X', url: 'https://localhost/' })).toThrow()
    expect(() => validateSite({ name: '', url: 'https://linear.app' })).toThrow(/name/)
    expect(() => validateSite({ name: 'X', url: 'javascript:alert(1)' })).toThrow()
    expect(() => validateSite({ name: 'X', url: 'https://a.com', alsoHosts: 'not a host!' })).toThrow(/host/)
  })
  it('keeps CSS to style only and the user agent to one line', () => {
    expect(validateSite({ name: 'A', url: 'https://a.com', css: '.ad { display: none }' }).css).toBe('.ad { display: none }')
    expect(() => validateSite({ name: 'A', url: 'https://a.com', css: '@import "https://evil.com/x.css";' })).toThrow(/load/)
    expect(() => validateSite({ name: 'A', url: 'https://a.com', css: 'body { background: url(https://t.co/p.gif) }' })).toThrow(/load/)
    expect(() => validateSite({ name: 'A', url: 'https://a.com', ua: 'Mozilla\nX-Evil: 1' })).toThrow(/one line/)
    expect(validateSite({ name: 'A', url: 'https://a.com', ua: '' }).ua).toBeUndefined()
  })
  it('gives each site its own storage, never a built-in one, and keeps it on edit', () => {
    expect(validateSite({ name: 'WhatsApp', url: 'https://wa.me' }, []).id).toBe('site-whatsapp')
    expect(validateSite({ name: 'Linear', url: 'https://linear.app' }, ['site-linear']).id).toBe('site-linear-2')
    expect(validateSite({ name: 'Renamed', url: 'https://linear.app' }, ['site-linear'], 'site-linear').id).toBe('site-linear')
    expect(() => validateSite({ name: 'A', url: 'https://a.com' }, [], 'persist:gmail')).toThrow()
  })
  it('finds a site by its partition and holds it to its hosts', () => {
    const s = validateSite({ name: 'Linear', url: 'https://linear.app/' })
    const a = appOfPartition('persist:site-linear', [s])!
    expect(a.name).toBe('Linear')
    expect(allows(a, 'https://app.linear.app/x')).toBe(true)
    expect(allows(a, 'https://evil-linear.app/')).toBe(false)
    expect(allows(siteApp(s), 'http://linear.app/')).toBe(false)
    expect(appOfPartition('persist:site-linear')).toBeUndefined()
  })
  it('finds the icon a page names, else /favicon.ico', () => {
    expect(iconHref('<head><link rel="icon" href="/i.png"></head>', 'https://a.com/x')).toBe('https://a.com/i.png')
    expect(iconHref('<head><link rel="shortcut icon" href="https://cdn.a.com/f.ico"></head>', 'https://a.com/')).toBe('https://cdn.a.com/f.ico')
    expect(iconHref('<head></head>', 'https://a.com/x/y')).toBe('https://a.com/favicon.ico')
    expect(iconHref('<head><link rel="icon" href="http://a.com/i.png"></head>', 'https://a.com/')).toBe('https://a.com/favicon.ico')
  })
})
