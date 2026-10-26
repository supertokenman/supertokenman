import { describe, expect, it } from 'vitest'
import { checkUrl, rocketChat } from './rocketchat'

const me = { _id: 'U1', username: 'yuji', name: 'Yuji' }
function fake() {
  const posts: unknown[] = []
  const seen: string[] = []
  const f = (async (url: string, init?: RequestInit) => {
    seen.push(`${init?.method ?? 'GET'} ${url} ${(init?.headers as Record<string, string>)['X-Auth-Token']}`)
    const p = url.replace('https://chat.acme.dev/api/v1/', '')
    const J = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status })
    if (p === 'me') return J({ ...me, success: true })
    if (p === 'subscriptions.get') return J({ success: true, update: [
      { rid: 'D1', name: 'ana', t: 'd', unread: 2, userMentions: 0 },
      { rid: 'C1', name: 'dev', fname: 'dev', t: 'c', unread: 5, userMentions: 1 },
      { rid: 'C2', name: 'random', t: 'c', unread: 9, userMentions: 0 },
    ] })
    if (p.startsWith('im.history')) return J({ success: true, messages: [{ _id: 'm2', rid: 'D1', msg: 'Can you review the PR?', ts: '2026-10-25T10:00:00Z', u: { _id: 'U2', username: 'ana', name: 'Ana' } }] })
    if (p.startsWith('channels.history')) return J({ success: true, messages: [
      { _id: 'm9', rid: 'C1', msg: 'deploy done', ts: '2026-10-25T11:00:00Z', u: { _id: 'U3', username: 'bob' } },
      { _id: 'm8', rid: 'C1', msg: '@yuji the build is red', ts: '2026-10-25T10:30:00Z', tmid: 'T5', u: { _id: 'U3', username: 'bob' }, mentions: [{ _id: 'U1', username: 'yuji' }] },
    ] })
    if (p === 'chat.postMessage') return (posts.push(JSON.parse(String(init!.body))), J({ success: true }))
    return J({ success: false, error: 'not found' }, 404)
  }) as unknown as typeof fetch
  return { f, posts, seen }
}

describe('rocket.chat', () => {
  it('reads direct messages and mentions, never plain channel chatter', async () => {
    const { f, seen } = fake()
    const rc = rocketChat(() => ({ url: 'https://chat.acme.dev/' }), () => ({ userId: 'U1', token: 'tok' }), f)
    const items = await rc.inbox()
    expect(items.map((i) => [i.kind, i.roomName, i.thread, i.text, i.url])).toEqual([
      ['direct', '@ana', 'D1/D1', 'Can you review the PR?', 'https://chat.acme.dev/direct/ana'],
      ['mention', '#dev', 'C1/T5', '@yuji the build is red', 'https://chat.acme.dev/channel/dev/thread/T5'],
    ])
    expect(seen.every((s) => s.endsWith(' tok'))).toBe(true)
  })
  it('replies in the thread and alerts only for kinds turned on', async () => {
    const { f, posts } = fake()
    const rc = rocketChat(() => ({ url: 'https://chat.acme.dev', alertRoom: '#alerts', alerts: { ci: true } }), () => ({ userId: 'U1', token: 'tok' }), f)
    await rc.reply({ room: 'C1', thread: 'C1/T5' }, 'Looking now')
    await rc.reply({ room: 'D1', thread: 'D1/D1' }, 'Sure')
    expect(await rc.alert('turns', 'x')).toBe(false)
    expect(await rc.alert('ci', 'CI failed on main')).toBe(true)
    expect(posts).toEqual([{ roomId: 'C1', text: 'Looking now', tmid: 'T5' }, { roomId: 'D1', text: 'Sure' }, { channel: '#alerts', text: 'SuperTokenMan: CI failed on main' }])
  })
  it('checks the address and reports errors', async () => {
    expect(checkUrl('http://chat.acme.dev')).toMatch(/https/)
    expect(checkUrl('http://localhost:3000')).toBeNull()
    const rc = rocketChat(() => ({ url: 'https://chat.acme.dev' }), () => null)
    await expect(rc.me()).rejects.toThrow(/Connect/)
  })
})
