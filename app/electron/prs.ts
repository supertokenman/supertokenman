// Pull requests: the ones waiting on you across GitHub, and one PR in full (diff by file, reviews,
// comments on lines, checks) with comment, review, merge and checkout.
import type { Api } from './ci.js'

export type PrItem = { repo: string; number: number; title: string; author: string; draft: boolean; updatedAt: string; comments: number; url: string; labels: string[] }
export type Inbox = { review: PrItem[]; mine: PrItem[]; involved: PrItem[] }
export type PrFile = { path: string; status: string; additions: number; deletions: number; patch: string }
export type LineComment = { id: number; author: string; body: string; path: string; line: number | null; at: string; replyTo: number | null }
export type Review = { author: string; state: string; body: string; at: string }
export type Check = { name: string; status: string; conclusion: string | null; url: string }
export type PrDetail = {
  repo: string
  number: number
  title: string
  body: string
  author: string
  state: string
  draft: boolean
  merged: boolean
  mergeable: boolean | null
  mergeState: string
  head: string
  base: string
  sha: string
  additions: number
  deletions: number
  url: string
  files: PrFile[]
  reviews: Review[]
  lineComments: LineComment[]
  comments: { author: string; body: string; at: string }[]
  checks: Check[]
}

type RawIssue = { number: number; title: string; user: { login: string }; draft?: boolean; updated_at: string; comments: number; html_url: string; repository_url: string; labels: { name: string }[] }

export const toItem = (i: RawIssue): PrItem => ({
  repo: i.repository_url.replace('https://api.github.com/repos/', ''),
  number: i.number,
  title: i.title,
  author: i.user.login,
  draft: !!i.draft,
  updatedAt: i.updated_at,
  comments: i.comments,
  url: i.html_url,
  labels: i.labels.map((l) => l.name),
})

const search = async (api: Api, q: string) =>
  (((await api(`/search/issues?q=${encodeURIComponent(`${q} is:pr is:open archived:false`)}&sort=updated&per_page=30`)) as { items: RawIssue[] }).items ?? []).map(toItem)

/** What waits on you: reviews asked of you, your own PRs, and others you are part of. */
export async function inbox(api: Api): Promise<Inbox> {
  const [review, mine, involved] = await Promise.all([search(api, 'review-requested:@me'), search(api, 'author:@me'), search(api, 'involves:@me -author:@me')])
  const seen = new Set(review.map((p) => `${p.repo}#${p.number}`))
  return { review, mine, involved: involved.filter((p) => !seen.has(`${p.repo}#${p.number}`)) }
}

/** A repository's open PRs, newest activity first. */
export async function ofRepo(api: Api, repo: string): Promise<PrItem[]> {
  return search(api, `repo:${repo}`)
}

const REPO = /^[A-Za-z0-9][\w-]*\/(?!\.\.?$)[\w.-]+$/
const valid = (repo: string, n: number) => {
  if (!REPO.test(repo) || !Number.isInteger(n) || n < 1) throw new Error('Not a pull request.')
  return `/repos/${repo}`
}

export async function detail(api: Api, repo: string, n: number): Promise<PrDetail> {
  const base = valid(repo, n)
  type RawPr = { title: string; body: string | null; user: { login: string }; state: string; draft: boolean; merged: boolean; mergeable: boolean | null; mergeable_state: string; head: { ref: string; sha: string }; base: { ref: string }; additions: number; deletions: number; html_url: string }
  const pr = (await api(`${base}/pulls/${n}`)) as RawPr
  const [files, reviews, lineComments, comments, checks] = await Promise.all([
    api(`${base}/pulls/${n}/files?per_page=100`) as Promise<{ filename: string; status: string; additions: number; deletions: number; patch?: string }[]>,
    api(`${base}/pulls/${n}/reviews?per_page=100`) as Promise<{ user: { login: string } | null; state: string; body: string; submitted_at: string }[]>,
    api(`${base}/pulls/${n}/comments?per_page=100`) as Promise<{ id: number; user: { login: string } | null; body: string; path: string; line: number | null; original_line: number | null; created_at: string; in_reply_to_id?: number }[]>,
    api(`${base}/issues/${n}/comments?per_page=100`) as Promise<{ user: { login: string } | null; body: string; created_at: string }[]>,
    (api(`${base}/commits/${pr.head.sha}/check-runs?per_page=100`) as Promise<{ check_runs: { name: string; status: string; conclusion: string | null; html_url: string }[] }>).catch(() => ({ check_runs: [] })),
  ])
  return {
    repo,
    number: n,
    title: pr.title,
    body: pr.body ?? '',
    author: pr.user.login,
    state: pr.state,
    draft: pr.draft,
    merged: pr.merged,
    mergeable: pr.mergeable,
    mergeState: pr.mergeable_state,
    head: pr.head.ref,
    base: pr.base.ref,
    sha: pr.head.sha,
    additions: pr.additions,
    deletions: pr.deletions,
    url: pr.html_url,
    files: files.map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch ?? '' })),
    reviews: reviews.filter((r) => r.state !== 'PENDING').map((r) => ({ author: r.user?.login ?? 'ghost', state: r.state, body: r.body, at: r.submitted_at })),
    lineComments: lineComments.map((c) => ({ id: c.id, author: c.user?.login ?? 'ghost', body: c.body, path: c.path, line: c.line ?? c.original_line, at: c.created_at, replyTo: c.in_reply_to_id ?? null })),
    comments: comments.map((c) => ({ author: c.user?.login ?? 'ghost', body: c.body, at: c.created_at })),
    checks: checks.check_runs.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url })),
  }
}

export async function comment(api: Api, repo: string, n: number, body: string) {
  if (!body.trim()) throw new Error('Write something first.')
  await api(`${valid(repo, n)}/issues/${n}/comments`, { method: 'POST', body: { body } })
}

export async function review(api: Api, repo: string, n: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string) {
  if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) throw new Error('Unknown review.')
  if (event !== 'APPROVE' && !body.trim()) throw new Error('Say what to change.')
  await api(`${valid(repo, n)}/pulls/${n}/reviews`, { method: 'POST', body: { event, body } })
}

export async function merge(api: Api, repo: string, n: number, method: 'merge' | 'squash' | 'rebase') {
  if (!['merge', 'squash', 'rebase'].includes(method)) throw new Error('Unknown merge method.')
  await api(`${valid(repo, n)}/pulls/${n}/merge`, { method: 'PUT', body: { merge_method: method } })
}

/** The open review threads as text for Claude: each first comment with its replies, by file and line. */
export function threadsText(d: PrDetail): string {
  const roots = d.lineComments.filter((c) => !c.replyTo)
  return roots
    .map((r) => {
      const replies = d.lineComments.filter((c) => c.replyTo === r.id)
      return [`${r.path}${r.line ? `:${r.line}` : ''} (${r.author}): ${r.body}`, ...replies.map((c) => `  reply (${c.author}): ${c.body}`)].join('\n')
    })
    .join('\n\n')
}
