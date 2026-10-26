import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { comment, detail, giteaApi, inbox, merge, review } from './gitea'

let port = 0
const seen: { method: string; url: string; auth?: string; body: string }[] = []
const pr = (n: number, repo = 'me/shop') => ({ number: n, title: `PR ${n}`, user: { login: 'ana' }, updated_at: '2026-10-25T10:00:00Z', comments: 1, html_url: `http://g/${repo}/pulls/${n}`, repository: { full_name: repo }, labels: [{ name: 'bug' }], pull_request: { draft: false } })
const srv = createServer((q, r) => {
  let b = ''
  q.on('data', (c) => (b += c))
  q.on('end', () => {
    seen.push({ method: q.method!, url: q.url!, auth: q.headers.authorization, body: b })
    const j = (x: unknown) => r.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(x))
    const u = q.url!
    if (u.startsWith('/api/v1/repos/issues/search')) return j(u.includes('review_requested') ? [pr(1)] : u.includes('created') ? [pr(2)] : [pr(1), pr(3, 'team/api')])
    if (u === '/api/v1/repos/me/shop/pulls/1') return j({ title: 'Add Pix', body: 'b', user: { login: 'ana' }, state: 'open', merged: false, mergeable: true, head: { ref: 'pix', sha: 'abc' }, base: { ref: 'main' }, html_url: 'http://g/me/shop/pulls/1' })
    if (u.startsWith('/api/v1/repos/me/shop/pulls/1/files')) return j([{ filename: 'src/pix.ts', status: 'added', additions: 10, deletions: 0 }])
    if (u === '/api/v1/repos/me/shop/pulls/1.diff') return r.end('diff --git a/src/pix.ts b/src/pix.ts\n+export const pix = 1\n')
    if (u.endsWith('/reviews')) return j([{ user: { login: 'bo' }, state: 'REQUEST_CHANGES', body: 'rename', submitted_at: 'x' }])
    if (u.endsWith('/comments')) return q.method === 'POST' ? j({}) : j([{ user: { login: 'bo' }, body: 'hi', created_at: 'x' }])
    if (u.endsWith('/commits/abc/status')) return j({ statuses: [{ context: 'ci/test', status: 'failure', target_url: 'http://g/ci/1' }, { context: 'ci/lint', status: 'pending', target_url: '' }] })
    if (u.endsWith('/merge')) return r.writeHead(200).end()
    r.writeHead(404).end()
  })
})
beforeAll(async () => { await new Promise<void>((d) => srv.listen(0, '127.0.0.1', d)); port = (srv.address() as { port: number }).port })
afterAll(() => srv.close())

describe('gitea forge', () => {
  it('builds the inbox in the GitHub shapes, without repeats', async () => {
    const api = giteaApi(`http://127.0.0.1:${port}`, 'tok-1')
    const ib = await inbox(api)
    expect(ib.review.map((p) => p.number)).toEqual([1])
    expect(ib.mine.map((p) => p.number)).toEqual([2])
    expect(ib.involved.map((p) => `${p.repo}#${p.number}`)).toEqual(['team/api#3'])
    expect(seen.every((s) => s.auth === 'token tok-1')).toBe(true)
  })
  it('reads a PR with files, patch, reviews and commit statuses as checks', async () => {
    const d = await detail(giteaApi(`http://127.0.0.1:${port}`, 'tok-1'), 'me/shop', 1)
    expect(d.files[0]).toEqual({ path: 'src/pix.ts', status: 'added', additions: 10, deletions: 0, patch: '+export const pix = 1\n' })
    expect(d.reviews[0]!.state).toBe('CHANGES_REQUESTED')
    expect(d.checks.map((c) => [c.name, c.conclusion])).toEqual([['ci/test', 'failure'], ['ci/lint', null]])
  })
  it('writes comments, reviews and merges in Gitea\'s words', async () => {
    const api = giteaApi(`http://127.0.0.1:${port}`, 'tok-1')
    await comment(api, 'me/shop', 1, 'looks good')
    await review(api, 'me/shop', 1, 'APPROVE', '')
    expect(JSON.parse(seen.at(-1)!.body)).toEqual({ event: 'APPROVED', body: '' })
    await merge(api, 'me/shop', 1, 'squash')
    expect(JSON.parse(seen.at(-1)!.body)).toEqual({ Do: 'squash' })
  })
  it('never sends the token elsewhere, and wants https off this machine', async () => {
    const api = giteaApi(`http://127.0.0.1:${port}`, 'tok-1')
    await expect(api('//evil.example.com/x')).rejects.toThrow(/Refused/)
    await expect(api('https://evil.example.com/x')).rejects.toThrow(/Refused/)
    expect(() => giteaApi('http://git.example.com', 't')).toThrow(/https/)
  })
})
