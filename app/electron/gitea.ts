// Phase 111: Gitea and Forgejo as a forge next to GitHub. The same shapes the PR inbox and the PR
// screen use, filled from Gitea's REST API (/api/v1). The token goes to the configured host only.
import type { Api } from './ci.js'
import type { Inbox, PrDetail, PrItem } from './prs.js'

export function giteaApi(base: string, token: string, doFetch: typeof fetch = fetch): Api {
  const root = new URL(base)
  if (root.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(root.hostname)) throw new Error('Use https for Gitea, or http only on this machine.')
  return async (path, init) => {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Refused: not a Gitea API path.')
    const url = new URL(`/api/v1${path}`, root)
    // the token never leaves for another host, whatever a path says
    if (url.host !== root.host) throw new Error('Refused: another host.')
    const r = await doFetch(url, { method: init?.method ?? 'GET', headers: { Authorization: `token ${token}`, Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, body: init?.body ? JSON.stringify(init.body) : undefined })
    if (!r.ok) throw new Error(`Gitea answered ${r.status}${r.status === 401 ? ': check the token' : ''}`)
    const text = await r.text()
    return init?.raw ? text : text.trim() ? JSON.parse(text) : null
  }
}

type RawIssue = { number: number; title: string; user: { login: string }; updated_at: string; comments: number; html_url: string; repository: { full_name: string }; labels: { name: string }[]; pull_request?: { draft?: boolean } | null }
const toItem = (i: RawIssue): PrItem => ({ repo: i.repository.full_name, number: i.number, title: i.title, author: i.user.login, draft: Boolean(i.pull_request?.draft), updatedAt: i.updated_at, comments: i.comments, url: i.html_url, labels: (i.labels ?? []).map((l) => l.name) })
const search = async (api: Api, q: string) => ((await api(`/repos/issues/search?type=pulls&state=open&limit=30&${q}`)) as RawIssue[]).map(toItem)

export async function inbox(api: Api): Promise<Inbox> {
  const [review, mine, involved] = await Promise.all([search(api, 'review_requested=true'), search(api, 'created=true'), search(api, 'mentioned=true')])
  const seen = new Set([...review, ...mine].map((p) => `${p.repo}#${p.number}`))
  return { review, mine, involved: involved.filter((p) => !seen.has(`${p.repo}#${p.number}`)) }
}

const REPO = /^[A-Za-z0-9][\w.-]*\/(?!\.\.?$)[\w.-]+$/
const valid = (repo: string, n: number) => {
  if (!REPO.test(repo) || !Number.isInteger(n) || n < 1) throw new Error('Not a pull request.')
  return `/repos/${repo}`
}

export async function detail(api: Api, repo: string, n: number): Promise<PrDetail> {
  const base = valid(repo, n)
  type RawPr = { title: string; body: string | null; user: { login: string }; state: string; draft?: boolean; merged: boolean; mergeable: boolean; head: { ref: string; sha: string }; base: { ref: string }; additions?: number; deletions?: number; html_url: string }
  const pr = (await api(`${base}/pulls/${n}`)) as RawPr
  const [files, reviews, comments, status] = await Promise.all([
    (api(`${base}/pulls/${n}/files?limit=100`) as Promise<{ filename: string; status: string; additions: number; deletions: number }[]>).catch(() => []),
    (api(`${base}/pulls/${n}/reviews`) as Promise<{ user: { login: string } | null; state: string; body: string; submitted_at: string }[]>).catch(() => []),
    (api(`${base}/issues/${n}/comments`) as Promise<{ user: { login: string } | null; body: string; created_at: string }[]>).catch(() => []),
    (api(`${base}/commits/${pr.head.sha}/status`) as Promise<{ statuses: { context: string; status: string; target_url: string }[] | null }>).catch(() => ({ statuses: [] })),
  ])
  const diff = (await (api(`${base}/pulls/${n}.diff`, { raw: true }) as Promise<string>).catch(() => '')) || ''
  const patchOf = (path: string) => /^diff --git /m.test(diff) ? (diff.split(/^diff --git /m).find((b) => b.startsWith(`a/${path} `))?.split('\n').slice(1).join('\n') ?? '') : ''
  return {
    repo,
    number: n,
    title: pr.title,
    body: pr.body ?? '',
    author: pr.user.login,
    state: pr.state,
    draft: Boolean(pr.draft),
    merged: pr.merged,
    mergeable: pr.mergeable,
    mergeState: pr.mergeable ? 'clean' : 'dirty',
    head: pr.head.ref,
    base: pr.base.ref,
    sha: pr.head.sha,
    additions: pr.additions ?? files.reduce((a, f) => a + f.additions, 0),
    deletions: pr.deletions ?? files.reduce((a, f) => a + f.deletions, 0),
    url: pr.html_url,
    files: files.map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: patchOf(f.filename) })),
    reviews: reviews.filter((r) => r.state !== 'PENDING').map((r) => ({ author: r.user?.login ?? 'ghost', state: r.state === 'APPROVED' ? 'APPROVED' : r.state === 'REQUEST_CHANGES' ? 'CHANGES_REQUESTED' : r.state, body: r.body, at: r.submitted_at })),
    lineComments: [],
    comments: comments.map((c) => ({ author: c.user?.login ?? 'ghost', body: c.body, at: c.created_at })),
    // commit statuses are what Gitea Actions and outside CI report
    checks: (status.statuses ?? []).map((s) => ({ name: s.context, status: s.status === 'pending' ? 'in_progress' : 'completed', conclusion: s.status === 'pending' ? null : s.status === 'success' ? 'success' : s.status === 'warning' ? 'neutral' : 'failure', url: s.target_url })),
  }
}

export async function comment(api: Api, repo: string, n: number, body: string) {
  if (!body.trim()) throw new Error('Write something first.')
  await api(`${valid(repo, n)}/issues/${n}/comments`, { method: 'POST', body: { body } })
}
export async function review(api: Api, repo: string, n: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string) {
  if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) throw new Error('Unknown review.')
  if (event !== 'APPROVE' && !body.trim()) throw new Error('Say what to change.')
  await api(`${valid(repo, n)}/pulls/${n}/reviews`, { method: 'POST', body: { event: event === 'APPROVE' ? 'APPROVED' : event, body } })
}
export async function merge(api: Api, repo: string, n: number, method: 'merge' | 'squash' | 'rebase') {
  if (!['merge', 'squash', 'rebase'].includes(method)) throw new Error('Unknown merge method.')
  await api(`${valid(repo, n)}/pulls/${n}/merge`, { method: 'POST', body: { Do: method } })
}
