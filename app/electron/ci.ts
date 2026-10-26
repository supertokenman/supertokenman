// GitHub Actions for a panel's repository: the runs of its branch, their jobs and steps, the lines
// that explain a failure, and re-run or cancel. Signs in with the vault's token or the gh CLI's.
import { execFile } from 'node:child_process'

export type Step = { name: string; status: string; conclusion: string | null; number: number }
export type Job = { id: number; name: string; status: string; conclusion: string | null; startedAt: string | null; completedAt: string | null; url: string; steps: Step[] }
export type Run = {
  id: number
  workflow: string
  title: string
  branch: string
  sha: string
  event: string
  status: string
  conclusion: string | null
  createdAt: string
  updatedAt: string
  url: string
  attempt: number
}

/** `owner/repo` of a GitHub remote URL (https or ssh), or null. */
export function parseRemote(url: string): string | null {
  const m = url.trim().match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

const sh = (cmd: string, args: string[], cwd?: string) =>
  new Promise<string>((resolve, reject) => execFile(cmd, args, { cwd, timeout: 8000 }, (err, out) => (err ? reject(err) : resolve(out.trim()))))

/** The repository and branch of a folder, or null when it is not a GitHub checkout. */
export async function repoOf(cwd: string, run = sh): Promise<{ repo: string; branch: string } | null> {
  try {
    const repo = parseRemote(await run('git', ['remote', 'get-url', 'origin'], cwd))
    if (!repo) return null
    const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
    return { repo, branch }
  } catch {
    return null
  }
}

/** A token: the vault's first, then the gh CLI's login. */
export async function token(fromVault?: string, run = sh): Promise<string | undefined> {
  if (fromVault) return fromVault
  try {
    return (await run('gh', ['auth', 'token'])) || undefined
  } catch {
    return undefined
  }
}

export type Api = (path: string, init?: { method?: string; raw?: boolean; body?: unknown }) => Promise<unknown>

/** A GitHub REST client for a token. */
export const github = (tok: string, fetchFn: typeof fetch = fetch): Api => async (path, init = {}) => {
  const r = await fetchFn(`${process.env.STM_GH_API ?? 'https://api.github.com'}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'SuperTokenMan', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  if (!r.ok) {
    const why = await r.json().then((j: { message?: string }) => j.message, () => '')
    throw new Error(`GitHub answered ${r.status} for ${path.split('?')[0]}${why ? `: ${why}` : ''}`)
  }
  if (r.status === 202 || r.status === 204 || (init.method === 'POST' && !init.body)) return null
  return init.raw ? r.text() : r.json()
}

type RawRun = { id: number; name: string; display_title: string; head_branch: string; head_sha: string; event: string; status: string; conclusion: string | null; created_at: string; updated_at: string; html_url: string; run_attempt: number }

export async function runs(api: Api, repo: string, branch: string): Promise<Run[]> {
  const j = (await api(`/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=12`)) as { workflow_runs?: RawRun[] }
  return (j.workflow_runs ?? []).map((r) => ({
    id: r.id,
    workflow: r.name,
    title: r.display_title,
    branch: r.head_branch,
    sha: r.head_sha.slice(0, 7),
    event: r.event,
    status: r.status,
    conclusion: r.conclusion,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    url: r.html_url,
    attempt: r.run_attempt,
  }))
}

export async function jobs(api: Api, repo: string, runId: number): Promise<Job[]> {
  const j = (await api(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=50`)) as {
    jobs?: { id: number; name: string; status: string; conclusion: string | null; started_at: string | null; completed_at: string | null; html_url: string; steps?: { name: string; status: string; conclusion: string | null; number: number }[] }[]
  }
  return (j.jobs ?? []).map((x) => ({ id: x.id, name: x.name, status: x.status, conclusion: x.conclusion, startedAt: x.started_at, completedAt: x.completed_at, url: x.html_url, steps: (x.steps ?? []).map((s) => ({ name: s.name, status: s.status, conclusion: s.conclusion, number: s.number })) }))
}

/**
 * The lines of a job log that explain a failure: GitHub's error annotations and lines that look
 * like errors, each with a little context; the end of the log when nothing stands out.
 */
export function failureExcerpt(log: string, max = 60): string {
  const lines = log.split('\n').map((l) => l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, '').replace(/\x1b\[[0-9;]*m/g, ''))
  const hit = (l: string) => /##\[error\]|\berror\b|\bERR!|\bFAIL(ED)?\b|✗|×|AssertionError|Exception|Traceback|exit code [1-9]/i.test(l)
  const keep = new Set<number>()
  lines.forEach((l, i) => {
    if (hit(l)) for (let k = Math.max(0, i - 2); k <= Math.min(lines.length - 1, i + 3); k++) keep.add(k)
  })
  const picked = [...keep].sort((a, b) => a - b)
  if (!picked.length) return lines.slice(-max).join('\n').trim()
  const out: string[] = []
  let last = -2
  for (const i of picked) {
    if (i > last + 1 && out.length) out.push('...')
    out.push(lines[i]!)
    last = i
  }
  return out.slice(-max).join('\n').trim()
}

export const log = async (api: Api, repo: string, jobId: number) => failureExcerpt(String(await api(`/repos/${repo}/actions/jobs/${jobId}/logs`, { raw: true })))
export const rerunFailed = (api: Api, repo: string, runId: number) => api(`/repos/${repo}/actions/runs/${runId}/rerun-failed-jobs`, { method: 'POST' })
export const cancel = (api: Api, repo: string, runId: number) => api(`/repos/${repo}/actions/runs/${runId}/cancel`, { method: 'POST' })

/** Runs that finished since the last look: what to tell the panel about. */
export function finished(before: Run[], after: Run[]): Run[] {
  const was = new Map(before.map((r) => [r.id, r]))
  return after.filter((r) => r.status === 'completed' && was.has(r.id) && was.get(r.id)!.status !== 'completed')
}
