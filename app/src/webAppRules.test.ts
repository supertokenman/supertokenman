import { describe, expect, it } from 'vitest'
import { allows, appOfPartition, isAppPage, unreadOf, WEB_APPS } from '../shared/webapps'

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
