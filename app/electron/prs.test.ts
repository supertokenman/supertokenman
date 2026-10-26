import { describe, expect, it } from 'vitest'
import type { Api } from './ci'
import * as P from './prs'

const issue = (repo: string, number: number) => ({ number, title: `t${number}`, user: { login: 'a' }, updated_at: '2026-10-22T00:00:00Z', comments: 2, html_url: 'u', repository_url: `https://api.github.com/repos/${repo}`, labels: [{ name: 'bug' }] })

describe('pull requests', () => {
  it('builds the inbox without repeating reviews in involved', async () => {
    const api: Api = async (path) => {
      const q = decodeURIComponent(path)
      if (q.includes('review-requested')) return { items: [issue('o/r', 1)] }
      if (q.includes('involves')) return { items: [issue('o/r', 1), issue('o/x', 3)] }
      if (q.includes('author:@me')) return { items: [issue('o/r', 2)] }
      return { items: [issue('o/r', 1), issue('o/x', 3)] }
    }
    const box = await P.inbox(api)
    expect(box.review.map((p) => p.number)).toEqual([1])
    expect(box.mine[0]).toMatchObject({ repo: 'o/r', number: 2, labels: ['bug'] })
    expect(box.involved.map((p) => `${p.repo}#${p.number}`)).toEqual(['o/x#3'])
  })
  it('sends review, comment and merge bodies, and checks input', async () => {
    const calls: { path: string; init?: unknown }[] = []
    const api: Api = async (path, init) => (calls.push({ path, init }), null)
    await P.review(api, 'o/r', 4, 'APPROVE', '')
    await P.comment(api, 'o/r', 4, 'looks good')
    await P.merge(api, 'o/r', 4, 'squash')
    expect(calls).toEqual([
      { path: '/repos/o/r/pulls/4/reviews', init: { method: 'POST', body: { event: 'APPROVE', body: '' } } },
      { path: '/repos/o/r/issues/4/comments', init: { method: 'POST', body: { body: 'looks good' } } },
      { path: '/repos/o/r/pulls/4/merge', init: { method: 'PUT', body: { merge_method: 'squash' } } },
    ])
    await expect(P.review(api, 'o/r', 4, 'REQUEST_CHANGES', ' ')).rejects.toThrow()
    await expect(P.comment(api, '../etc', 4, 'x')).rejects.toThrow()
    await expect(P.comment(api, 'o/..', 4, 'x')).rejects.toThrow()
  })
  it('writes review threads for Claude', () => {
    const d = { lineComments: [
      { id: 1, author: 'rev', body: 'rename this', path: 'a.ts', line: 3, at: '', replyTo: null },
      { id: 2, author: 'me', body: 'ok', path: 'a.ts', line: 3, at: '', replyTo: 1 },
    ] } as P.PrDetail
    expect(P.threadsText(d)).toBe('a.ts:3 (rev): rename this\n  reply (me): ok')
  })
})
